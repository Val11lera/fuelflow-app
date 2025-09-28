// src/lib/access-guard.ts
// src/lib/access-guard.ts
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Ensures a user is signed in and not blocked.
 * Returns the lowercased email if OK, otherwise throws:
 *  - 'signin'  -> not logged in
 *  - 'blocked' -> found in blocked_users table
 */
export async function ensureClientAccess(supabase: SupabaseClient): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const email = (session?.user?.email || "").toLowerCase();

  if (!email) throw new Error("signin");

  // Check blocked
  const { data: blk, error: blkErr } = await supabase
    .from("blocked_users")
    .select("email")
    .eq("email", email)
    .maybeSingle();

  if (!blkErr && blk?.email) throw new Error("blocked");

  // (Optional) If you want to block non-allowlisted from viewing the client dashboard entirely,
  // uncomment below. If not, leave as-is to allow them to see a "pending" state in your UI.
  //
  // const { data: allow } = await supabase
  //   .from("email_allowlist")
  //   .select("email")
  //   .eq("email", email)
  //   .maybeSingle();
  // if (!allow?.email) throw new Error("pending");

  return email;
}
