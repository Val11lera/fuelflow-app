// src/lib/access-guard.ts
// src/lib/access-guard.ts
import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Ensures the current session user:
 *  - is signed in
 *  - is NOT in blocked_users
 *  - IS in email_allowlist
 *
 * Returns lowercased email string on success.
 * Throws one of: "signin" | "blocked" | "pending"
 */
export async function ensureClientAccess(supabase: SupabaseClient): Promise<string> {
  const { data: { user }, error: uerr } = await supabase.auth.getUser();
  if (uerr) throw new Error("signin");
  const email = user?.email?.toLowerCase();
  if (!email) throw new Error("signin");

  // Blocked?
  {
    const { data, error } = await supabase
      .from("blocked_users")
      .select("email")
      .eq("email", email)
      .maybeSingle();
    if (error) throw new Error("signin");
    if (data?.email) throw new Error("blocked");
  }

  // Allow-listed?
  {
    const { data, error } = await supabase
      .from("email_allowlist")
      .select("email")
      .eq("email", email)
      .maybeSingle();
    if (error) throw new Error("signin");
    if (!data?.email) throw new Error("pending");
  }

  return email;
}

