// src/pages/api/terms-accept.ts
// src/pages/api/terms-accept.ts
// @ts-nocheck
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

export const config = {
  api: { bodyParser: { sizeLimit: "1mb" } },
};

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!; // write access required
  return createClient(url, key, { auth: { persistSession: false } });
}

async function verifyHCaptcha(token?: string) {
  const secret = process.env.HCAPTCHA_SECRET_KEY;
  if (!secret) return { ok: true, reason: "HCAPTCHA_SECRET_KEY not set (skipping)" };
  if (!token) return { ok: false, reason: "Missing hCaptcha token" };
  try {
    const resp = await fetch("https://hcaptcha.com/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
    });
    const json = await resp.json();
    return { ok: !!json.success, reason: json["error-codes"]?.join(", ") || "hCaptcha failed" };
  } catch (e: any) {
    return { ok: false, reason: e?.message || "hCaptcha error" };
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  try {
    const { version, name, email, captchaToken } = req.body || {};
    if (!version) return res.status(400).send("Missing 'version'");

    const hcap = await verifyHCaptcha(captchaToken);
    if (!hcap.ok) return res.status(400).send(`Captcha failed: ${hcap.reason}`);

    // Evidence
    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      (req.socket as any)?.remoteAddress ||
      "";
    const userAgent = req.headers["user-agent"] || "";

    const supabase = getClient();

    // 1) Audit insert
    // create table if not exists public.terms_acceptances (
    //   id uuid primary key default gen_random_uuid(),
    //   email text,
    //   name text,
    //   version text not null,
    //   accepted_at timestamptz not null default now(),
    //   ip inet,
    //   user_agent text
    // );
    const { data: acc, error: accErr } = await supabase
      .from("terms_acceptances")
      .insert([
        {
          email: email || null,
          name: name || null,
          version,
          ip: ip || null,
          user_agent: userAgent || null,
        },
      ])
      .select("id")
      .single();

    if (accErr) return res.status(500).send(`Failed to record acceptance: ${accErr.message}`);

    // 2) Flip status so dashboard unlocks
    const acceptedAt = new Date().toISOString();
    if (email) {
      // profiles (ignore missing table/columns silently)
      await supabase
        .from("profiles")
        .update({
          terms_accepted: true,
          terms_version: version,
          terms_accepted_at: acceptedAt,
          documents_status: {
            termsAccepted: true,
            termsVersion: version,
            termsAcceptedAt: acceptedAt,
          },
        } as any)
        .eq("email", email);

      // clients (if your dashboard reads from here)
      await supabase
        .from("clients")
        .update({
          terms_accepted: true,
          terms_version: version,
          terms_accepted_at: acceptedAt,
          documents_status: {
            termsAccepted: true,
            termsVersion: version,
            termsAcceptedAt: acceptedAt,
          },
        } as any)
        .eq("email", email);

      // documents table example (uncomment if you use it)
      // await supabase
      //   .from("documents")
      //   .upsert(
      //     { email, terms_accepted: true, terms_version: version, terms_accepted_at: acceptedAt },
      //     { onConflict: "email" }
      //   );
    }

    return res.status(200).json({ id: acc?.id });
  } catch (e: any) {
    return res.status(500).send(e?.message || "Unexpected error");
  }
}
