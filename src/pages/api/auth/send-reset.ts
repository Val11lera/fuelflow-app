// src/pages/api/auth/send-reset.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

/** Supabase Admin (server only) */
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // NEVER expose this to the client
);

/** Optional hCaptcha server-side verification */
async function verifyHCaptcha(token?: string) {
  const secret = process.env.HCAPTCHA_SECRET;
  if (!secret) return true;                 // skip if not configured
  if (!token) return false;

  const body = new URLSearchParams({ secret, response: token });
  const r = await fetch("https://hcaptcha.com/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await r.json();
  return !!json?.success;
}

/** Simple, on-brand HTML email */
function resetEmailHtml(actionLink: string) {
  return `
  <div style="background:#0b1f3a;padding:28px 16px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#e6edf6;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#0f274a;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.08)">
      <tr>
        <td style="padding:20px 24px;border-bottom:1px solid rgba(255,255,255,0.08);">
          <img src="https://dashboard.fuelflow.co.uk/logo-email.png" alt="FuelFlow" height="28" style="vertical-align:middle">
        </td>
      </tr>
      <tr>
        <td style="padding:28px 24px;">
          <h1 style="margin:0 0 8px;font-size:28px;color:#ffd84d;">Reset your password</h1>
          <p style="margin:0 0 20px;color:#c9d7ee;line-height:1.55">
            We received a request to reset your FuelFlow password. If this wasn’t you, please ignore this email.
          </p>

          <a href="${actionLink}"
             style="display:inline-block;background:#ffd02a;color:#041F3E;text-decoration:none;
                    font-weight:700;padding:12px 18px;border-radius:10px;">
            Set a new password
          </a>

          <p style="margin:20px 0 0;color:#9fb0d6;font-size:14px;">
            Button not working? Click <a href="${actionLink}" style="color:#ffd84d;">this link</a>.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:18px 24px;border-top:1px solid rgba(255,255,255,0.08);color:#9fb0d6;font-size:12px;">
          © FuelFlow • Sent from <a href="https://dashboard.fuelflow.co.uk" style="color:#ffd84d;">dashboard.fuelflow.co.uk</a>
        </td>
      </tr>
    </table>
  </div>`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const { email, captchaToken } = (req.body || {}) as { email?: string; captchaToken?: string };

    if (!email || !/^\S+@\S+$/.test(email)) {
      return res.status(400).json({ error: "Valid email required" });
    }

    if (!(await verifyHCaptcha(captchaToken))) {
      return res.status(400).json({ error: "Captcha verification failed" });
    }

    // Where Supabase will redirect after verifying the token in the email
    const redirectTo =
      `${process.env.NEXT_PUBLIC_SITE_URL || "https://dashboard.fuelflow.co.uk"}/update-password`;

    // Ask Supabase Admin API for a recovery (reset) link
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo }
    });
    if (error) throw error;

    const actionLink =
      (data as any)?.properties?.action_link ||
      (data as any)?.action_link;
    if (!actionLink) throw new Error("No action_link returned from Supabase");

    // Send using your SMTP (same identity as the quote flow)
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST!,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM || "FuelFlow <no-reply@fuelflow.co.uk>",
      to: email,
      subject: "Reset your FuelFlow password",
      html: resetEmailHtml(actionLink),
      text: `Reset your password: ${actionLink}`
    });

    // Small delay to make enumeration harder
    await new Promise((r) => setTimeout(r, 300));

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("send-reset error:", err);
    return res.status(500).json({ error: err?.message || "Internal error" });
  }
}
