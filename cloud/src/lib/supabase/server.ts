//! Server Supabase client (Route Handlers / Server Components). Carries the
//! user's session via cookies, so `auth.getUser()` is the request trust
//! boundary. Fresh per request — never hoist to a module global.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(publicEnv.SUPABASE_URL, publicEnv.SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component — middleware refreshes the session.
        }
      },
    },
  });
}

/**
 * The authenticated user's id, validated against the auth server (not just
 * decoded from the cookie). Returns null when the request isn't signed in.
 */
export async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}
