// src/lib/access-guard.ts
// src/lib/access-guard.ts
import type { SupabaseClient } from "@supabase/supabase-js";

/** Throws Error("blocked") or Error("not_allowed") or Error("signin") */
export async function ensureClientAccess(supabase: SupabaseClient) {
  const { data: auth } = await supabase.auth.getUser();
  const email = (auth?.user?.email || "").toLowerCase();
  if (!email) throw new Error("signin");

  // Is blocked?
  const { data: blockedRow, error: blockedErr } = await supabase
    .from("blocked_users")
    .select("email")
    .eq("email", email)
    .maybeSingle();
  if (blockedErr) throw blockedErr;
  if (blockedRow?.email) throw new Error("blocked");

  // Is allow-listed?
  const { data: allowRow, error: allowErr } = await supabase
    .from("email_allowlist")
    .select("email")
    .eq("email", email)
    .maybeSingle();
  if (allowErr) throw allowErr;
  if (!allowRow?.email) throw new Error("not_allowed");

  return email;
}

export async function isAdminEmail(supabase: SupabaseClient, email?: string) {
  let lower = (email || "").toLowerCase();
  if (!lower) {
    const { data: auth } = await supabase.auth.getUser();
    lower = (auth?.user?.email || "").toLowerCase();
  }
  if (!lower) return false;

  const { data, error } = await supabase
    .from("admins")
    .select("email")
    .eq("email", lower)
    .maybeSingle();

  if (error) return false;
  return !!data?.email;
}
