//! Houston Cloud event forwarder.
//!
//! When the engine runs as a per-user cloud box (see `cloud/` + `always-on/`),
//! web / mobile clients can't reliably hold a direct WebSocket to a box that
//! freezes when idle. Instead the box forwards every `HoustonEvent` it emits
//! into a Supabase table; clients subscribe through Supabase Realtime and get
//! the same reactivity they'd get from the local WS firehose.
//!
//! This is a *consumer* of the in-process broadcast bus, exactly like the WS
//! forwarder in [`crate::ws`]. It does NOT replace the `EventSink` -- Supabase
//! is one more subscriber, so the local WS keeps working alongside it (a
//! desktop client inside the same box can still use WS while the web client
//! uses Supabase).
//!
//! Swappable transport: this module targets Supabase Realtime. A different
//! realtime brand is a different forwarder module wired the same way at boot --
//! the event source (the broadcast bus) never changes.

use houston_engine_protocol::event_topic;
use houston_ui_events::{BroadcastEventSink, HoustonEvent};
use serde_json::json;
use std::time::Duration;
use tokio::sync::broadcast::error::RecvError;

/// HTTP timeout for a single Supabase insert. Forwarding is best-effort and
/// must never wedge the forwarder behind a stalled request.
const INSERT_TIMEOUT: Duration = Duration::from_secs(10);

/// Resolved Supabase connection for the cloud event forwarder.
///
/// All three values must be present for the forwarder to run. The service-role
/// key is required because inserts bypass RLS (clients only ever read their own
/// rows); `user_id` scopes every row this box writes to the one cloud user the
/// box serves.
#[derive(Clone, PartialEq, Eq)]
pub struct CloudSinkConfig {
    /// Supabase project URL, e.g. `https://abcd.supabase.co`. No trailing slash.
    pub url: String,
    /// Service-role key (bypasses RLS). Secret -- env var only, never logged.
    pub service_role_key: String,
    /// The cloud user this box serves. Stamped onto every forwarded row.
    pub user_id: String,
}

// Hand-written so the service-role key can never leak into a debug log.
impl std::fmt::Debug for CloudSinkConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CloudSinkConfig")
            .field("url", &self.url)
            .field("service_role_key", &"<redacted>")
            .field("user_id", &self.user_id)
            .finish()
    }
}

impl CloudSinkConfig {
    /// Build from env. Returns `None` (cloud forwarding disabled) unless all of
    /// `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `HOUSTON_CLOUD_USER_ID`
    /// are set and non-empty.
    pub fn from_env() -> Option<Self> {
        Self::from_lookup(|k| std::env::var(k).ok())
    }

    /// Pure over `lookup` so the gating contract is unit-testable without
    /// touching the process environment.
    fn from_lookup(lookup: impl Fn(&str) -> Option<String>) -> Option<Self> {
        let nonempty =
            |k: &str| lookup(k).map(|v| v.trim().to_string()).filter(|v| !v.is_empty());
        let url = nonempty("SUPABASE_URL")?;
        let service_role_key = nonempty("SUPABASE_SERVICE_ROLE_KEY")?;
        let user_id = nonempty("HOUSTON_CLOUD_USER_ID")?;
        Some(Self {
            url: url.trim_end_matches('/').to_string(),
            service_role_key,
            user_id,
        })
    }

    /// PostgREST insert endpoint for the events table.
    fn rest_endpoint(&self) -> String {
        format!("{}/rest/v1/houston_events", self.url)
    }
}

/// JSON row body for a single forwarded event. Pure mapping (no I/O) so the
/// shape is unit-testable.
///
/// `event_type` is read back out of the serialized payload's `type` tag rather
/// than from a parallel match, so it can never drift as variants are added.
/// `topic` reuses the same routing key the WS firehose uses ([`event_topic`])
/// so clients can filter Supabase rows identically.
fn event_row(user_id: &str, event: &HoustonEvent) -> serde_json::Value {
    let payload = serde_json::to_value(event).unwrap_or(serde_json::Value::Null);
    let event_type = payload
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("Unknown")
        .to_string();
    json!({
        "user_id": user_id,
        "topic": event_topic(event),
        "event_type": event_type,
        "payload": payload,
    })
}

/// Spawn the cloud event forwarder. Subscribes to the broadcast bus and POSTs
/// every event to Supabase as the configured user. Fire-and-forget: the task
/// lives for the process; the returned handle is purely for callers that want
/// to await/abort it.
///
/// Insert failures are logged with `tracing::error!` and the loop continues --
/// the documented exception to the "no silent failures" rule (an event-forward
/// callback has no UI thread to toast on). A lagged broadcast receiver logs the
/// drop count and keeps going; losing a streaming delta is recoverable because
/// the final non-streaming event for that turn follows.
pub fn spawn(
    events: &BroadcastEventSink,
    config: CloudSinkConfig,
) -> tokio::task::JoinHandle<()> {
    let mut rx = events.subscribe();
    tokio::spawn(async move {
        let client = match reqwest::Client::builder().timeout(INSERT_TIMEOUT).build() {
            Ok(c) => c,
            Err(e) => {
                tracing::error!(
                    "[cloud-sink] could not build HTTP client, cloud sync disabled: {e}"
                );
                return;
            }
        };
        let endpoint = config.rest_endpoint();
        tracing::info!(
            "[cloud-sink] forwarding events to Supabase for user {}",
            config.user_id
        );
        loop {
            match rx.recv().await {
                Ok(event) => {
                    let row = event_row(&config.user_id, &event);
                    if let Err(e) =
                        post_event(&client, &endpoint, &config.service_role_key, &row).await
                    {
                        tracing::error!("[cloud-sink] failed to forward event to Supabase: {e}");
                    }
                }
                Err(RecvError::Lagged(n)) => {
                    tracing::error!(
                        "[cloud-sink] lagged, dropped {n} event(s) before Supabase forward"
                    );
                }
                Err(RecvError::Closed) => {
                    tracing::info!("[cloud-sink] broadcast closed, stopping forwarder");
                    break;
                }
            }
        }
    })
}

/// POST one event row to Supabase via PostgREST. `prefer: return=minimal` keeps
/// the response empty -- we only care that the insert landed.
async fn post_event(
    client: &reqwest::Client,
    endpoint: &str,
    service_role_key: &str,
    row: &serde_json::Value,
) -> anyhow::Result<()> {
    let resp = client
        .post(endpoint)
        .header("apikey", service_role_key)
        .header("authorization", format!("Bearer {service_role_key}"))
        .header("content-type", "application/json")
        .header("prefer", "return=minimal")
        .json(row)
        .send()
        .await?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        anyhow::bail!("Supabase insert returned {status}: {body}");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn lookup<'a>(
        map: &'a HashMap<&'static str, &'static str>,
    ) -> impl Fn(&str) -> Option<String> + 'a {
        move |k| map.get(k).map(|v| v.to_string())
    }

    #[test]
    fn config_requires_all_three_vars() {
        let mut m: HashMap<&str, &str> = HashMap::new();
        assert!(CloudSinkConfig::from_lookup(lookup(&m)).is_none());
        m.insert("SUPABASE_URL", "https://x.supabase.co");
        assert!(CloudSinkConfig::from_lookup(lookup(&m)).is_none());
        m.insert("SUPABASE_SERVICE_ROLE_KEY", "key");
        assert!(CloudSinkConfig::from_lookup(lookup(&m)).is_none());
        m.insert("HOUSTON_CLOUD_USER_ID", "user-1");
        assert!(CloudSinkConfig::from_lookup(lookup(&m)).is_some());
    }

    #[test]
    fn config_treats_blank_as_unset() {
        let mut m: HashMap<&str, &str> = HashMap::new();
        m.insert("SUPABASE_URL", "  ");
        m.insert("SUPABASE_SERVICE_ROLE_KEY", "key");
        m.insert("HOUSTON_CLOUD_USER_ID", "user-1");
        assert!(CloudSinkConfig::from_lookup(lookup(&m)).is_none());
    }

    #[test]
    fn config_strips_trailing_slash_and_builds_endpoint() {
        let mut m: HashMap<&str, &str> = HashMap::new();
        m.insert("SUPABASE_URL", "https://x.supabase.co/");
        m.insert("SUPABASE_SERVICE_ROLE_KEY", "key");
        m.insert("HOUSTON_CLOUD_USER_ID", "user-1");
        let cfg = CloudSinkConfig::from_lookup(lookup(&m)).unwrap();
        assert_eq!(cfg.url, "https://x.supabase.co");
        assert_eq!(
            cfg.rest_endpoint(),
            "https://x.supabase.co/rest/v1/houston_events"
        );
    }

    #[test]
    fn debug_redacts_service_role_key() {
        let cfg = CloudSinkConfig {
            url: "https://x.supabase.co".into(),
            service_role_key: "super-secret".into(),
            user_id: "u".into(),
        };
        let rendered = format!("{cfg:?}");
        assert!(!rendered.contains("super-secret"));
        assert!(rendered.contains("<redacted>"));
    }

    #[test]
    fn event_row_carries_user_topic_type_payload() {
        let event = HoustonEvent::Toast {
            message: "hi".into(),
            variant: "info".into(),
        };
        let row = event_row("user-9", &event);
        assert_eq!(row["user_id"], "user-9");
        assert_eq!(row["topic"], "toast");
        assert_eq!(row["event_type"], "Toast");
        assert_eq!(row["payload"]["type"], "Toast");
        assert_eq!(row["payload"]["data"]["message"], "hi");
    }

    #[test]
    fn event_row_topic_matches_firehose_for_agent_events() {
        let event = HoustonEvent::ActivityChanged {
            agent_path: "Workspace/Ada".into(),
        };
        let row = event_row("u", &event);
        // Same routing key the WS firehose uses, so clients filter identically.
        assert_eq!(row["topic"], "agent:Workspace/Ada");
        assert_eq!(row["event_type"], "ActivityChanged");
    }
}
