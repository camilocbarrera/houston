//! houston-engine-server — axum HTTP+WS server.
//!
//! Binary: `houston-engine`. Speaks `houston-engine-protocol` over HTTP and
//! WebSocket. Frontend-agnostic: every client (desktop, mobile, CLI,
//! third-party) talks to it over the wire.

pub mod auth;
pub mod cloud_sink;
pub mod config;
pub mod mobile_access;
pub mod routes;
pub mod state;
pub mod ws;

use axum::{http::HeaderValue, middleware, routing::get, Router};
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};

pub use config::ServerConfig;
pub use state::ServerState;

/// Build the full axum router for the engine.
pub fn build_router(state: Arc<ServerState>) -> Router {
    let v1 = Router::new()
        .route("/health", get(routes::health::health))
        .route("/version", get(routes::health::version))
        .route("/ws", get(ws::ws_upgrade))
        .merge(routes::workspaces::router())
        .merge(routes::preferences::router())
        .merge(routes::conversations::router())
        .merge(routes::providers::router())
        .merge(routes::agent_configs::router())
        .merge(routes::sessions::router())
        .merge(routes::skills::router())
        .merge(routes::attachments::router())
        .merge(routes::worktree::router())
        .merge(routes::store::router())
        .merge(routes::routines::router())
        .merge(routes::agents::router())
        .merge(routes::agent_files::router())
        .merge(routes::composio::router())
        .merge(routes::claude::router())
        .merge(routes::tunnel::router())
        .merge(routes::watcher::router())
        .merge(routes::portable::router())
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth::require_bearer,
        ))
        .layer(middleware::from_fn(routes::version_header));

    let router = Router::new().nest("/v1", v1);

    // CORS: add our own permissive layer ONLY for the local/loopback case —
    // the webview (tauri://localhost or http://localhost:1420 in dev) is
    // cross-origin to 127.0.0.1:<port>. Bearer tokens are not "credentials" in
    // CORS parlance, so wildcard + Any is safe here.
    //
    // Behind the cloud ingress proxy (Upstash Box — detected by the same
    // `HOUSTON_CLOUD_USER_ID` the cloud sink keys off), the PROXY already emits
    // `Access-Control-Allow-Origin`. Emitting ours too yields a DUPLICATE ACAO
    // header, which browsers reject as a CORS failure ("Load failed") — so a web
    // client can't read any box response. In that case we let the proxy own
    // CORS and skip our layer entirely.
    let behind_cloud_proxy = std::env::var("HOUSTON_CLOUD_USER_ID")
        .ok()
        .map(|v| !v.trim().is_empty())
        .unwrap_or(false);

    let router = if behind_cloud_proxy {
        router
    } else {
        router.layer(
            CorsLayer::new()
                .allow_origin("*".parse::<HeaderValue>().unwrap())
                .allow_methods(Any)
                .allow_headers(Any),
        )
    };

    router.with_state(state)
}
