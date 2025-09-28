// src/lib/access-guard.ts
import { SupabaseClient } from "@supabase/supabase-js";

export async function ensureClientAccess(supabase: SupabaseClient): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email) throw new Error("signin");

  // Blocked?
  {
    const { data, error } = await supabase
      .from("blocked_users")
      .select("email")
      .eq("email", email)
      .limit(1);
    if (error) throw new Error("signin");
    if (data && data.length) throw new Error("blocked");
  }

  // Allow-listed?
  {
    const { data, error } = await supabase
      .from("email_allowlist")
      .select("email")
      .eq("email", email)
      .limit(1);
    if (error) throw new Error("signin");
    if (!data || data.length === 0) throw new Error("pending");
  }

  return email;
}

