// src/pages/api/admin/approvals/set.ts
// /src/pages/api/admin/approvals/set.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

type Body = {
  action: "approve" | "block" | "unblock";
  email?: string;
  reason?: string | null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    // 405 for anything except POST
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anon || !service) {
    return res
      .status(500)
      .json({ error: "Server misconfigured: missing SUPABASE_SERVICE_ROLE_KEY or URL" });
  }

  // 1) Read and validate body
  let body: Body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  const action = body?.action;
  const emailLower = (body?.email || "").toLowerCase().trim();
  const reason = body?.reason ?? null;

  if (!action || !["approve", "block", "unblock"].includes(action)) {
    return res.status(400).json({ error: "Invalid or missing action" });
  }
  if (action !== "approve" && !emailLower) {
    // For block/unblock we need an email
    return res.status(400).json({ error: "Missing email" });
  }

  // 2) Verify caller is an admin using the session cookie (anon client)
  const anonClient = createServerClient(url, anon, {
    cookies: {
      get(name: string) {
        return req.cookies[name];
      },
      set(name: string, value: string, options: CookieOptions) {
        // reflect any cookie changes back to the browser
        res.setHeader("Set-Cookie", `${name}=${value}; Path=/; HttpOnly; SameSite=Lax`);
      },
      remove(name: string, options: CookieOptions) {
        res.setHeader("Set-Cookie", `${name}=; Path=/; Max-Age=0`);
      },
    },
  });

  const {
    data: { user },
  } = await anonClient.auth.getUser();

  if (!user?.email) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const adminEmail = user.email.toLowerCase();
  const { data: adminRow, error: adminErr } = await anonClient
    .from("admins")
    .select("email")
    .eq("email", adminEmail)
    .maybeSingle();

  if (adminErr || !adminRow?.email) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // 3) Perform the action with the SERVICE ROLE client (bypasses RLS for writes)
  const sr = createClient(url, service, { auth: { persistSession: false } });

  try {
    if (action === "approve") {
      // Approve = upsert into allow-list
      if (!emailLower) return res.status(400).json({ error: "Missing email" });
      const { error } = await sr
        .from("email_allowlist")
        .upsert({ email: emailLower }, { onConflict: "email" });
      if (error) throw error;
    }

    if (action === "block") {
      // Block = upsert into blocked_users (reason optional)
      const { error } = await sr
        .from("blocked_users")
        .upsert({ email: emailLower, reason }, { onConflict: "email" });
      if (error) throw error;

      // (Optional) try to force sessions to end. This API is not guaranteed to be present
      // across all supabase-js versions, so we ignore errors.
      try {
        // If you have an exact user id, you can delete or sign out.
        // Not strictly necessary: middleware blocks access anyway.
        // await sr.auth.admin.signOutUser(uid)
      } catch {}
    }

    if (action === "unblock") {
      // Unblock = delete from blocked_users
      const { error } = await sr.from("blocked_users").delete().eq("email", emailLower);
      if (error) throw error;
    }

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Unexpected error" });
  }
}

