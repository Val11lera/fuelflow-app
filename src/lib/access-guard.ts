// src/lib/access-guard.ts
import type { SupabaseClient } from "@supabase/supabase-js";

/** Throws an Error with reason: 'blocked' | 'not_allowed' */
export async function ensureClientAccess(supabase: SupabaseClient) {
  const { data: auth } = await supabase.auth.getUser();
  const email = (auth?.user?.email || "").toLowerCase();
  if (!email) throw new Error("signin");

  // Blocked?
  const { data: blockedRow, error: blockedErr } = await supabase
    .from("blocked_users")
    .select("email")
    .eq("email", email)
    .maybeSingle();
  if (blockedErr) throw blockedErr;
  if (blockedRow?.email) {
    throw new Error("blocked");
  }

  // Allow-listed?
  const { data: allowRow, error: allowErr } = await supabase
    .from("email_allowlist")
    .select("email")
    .eq("email", email)
    .maybeSingle();
  if (allowErr) throw allowErr;
  if (!allowRow?.email) {
    throw new Error("not_allowed");
  }

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
