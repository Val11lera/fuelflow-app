// src/lib/access-guard.ts
import { SupabaseClient } from "@supabase/supabase-js";

export async function ensureClientAccess(supabase: SupabaseClient): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email) throw new Error("signin");

  // 1) immediately fail if blocked
  {
    const { data, error } = await supabase
      .from("blocked_users")
      .select("email")
      .eq("email", email)
      .limit(1);

    if (error) throw new Error("signin");        // cannot validate → go login
    if (data && data.length) throw new Error("blocked");
  }

  // 2) must be allow-listed
  {
    const { data, error } = await supabase
      .from("email_allowlist")
      .select("email")
      .eq("email", email)
      .limit(1);

    if (error) throw new Error("signin");        // cannot validate → go login
    if (!data || data.length === 0) throw new Error("pending");
  }

  return email; // allowed
}

