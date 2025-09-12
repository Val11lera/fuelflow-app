// src/pages/api/auth/send-magic-link.ts
// @ts-nocheck
import type { NextApiRequest, NextApiResponse } from "next";
export const runtime = 'nodejs';
import { createClient } from "@supabase/supabase-js";

/** Runtime nodemailer (prevents build-time errors if package not present) */
function getNodemailer() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("nodemailer");
  } catch {
    return null;
  }
}

/** Verify hCaptcha server-side (optional but recommended) */
async function verifyHCaptcha(token?: string) {
  const secret = process.env.HCAPTCHA_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;

  const body = new URLSearchParams({ secret, response: token }).toString();
  try {
    const r = await fetch("https://hcaptcha.com/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const json = (await r.json()) as { success?: boolean };
    return !!json.success;
  } catch {
    return false;
  }
}

/** Shared branded email HTML (same styling as reset) */
function magicEmailHTML(actionUrl: string, email: string) {
  const logo = process.env.EMAIL_LOGO_URL || "https://dashboard.fuelflow.co.uk/logo-email.png";
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://fuelflow.co.uk";

  return `<!doctype html>
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <meta name="color-scheme" content="light only">
    <title>Your sign-in link</title>
    <style>
      body { margin:0; background:#041F3E; font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,'Helvetica Neue',Arial,'Apple Color Emoji','Segoe UI Emoji'; }
      .wrap { max-width:680px; margin:0 auto; padding:28px 16px; }
      .card { background:#0E2444; border-radius:16px; padding:24px; border:1px solid rgba(255,255,255,0.08); }
      .header { display:flex; align-items:center; gap:10px; color:#fff; margin-bottom:12px; }
      h1 { margin:14px 0 6px; font-size:28px; line-height:1.2; color:#ffd54d; }
      p, a { color:rgba(255,255,255,.88); font-size:15px; line-height:1.6; }
      .btn { display:inline-block; background:#FFD000; color:#041F3E !important; font-weight:700; padding:14px 18px; border-radius:12px; text-decoration:none; }
      .muted { color:rgba(255,255,255,.65); font-size:13px; }
      .footer { margin-top:18px; color:rgba(255,255,255,.55); font-size:12px; }
      .center { text-align:center; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <div class="header">
          <img src="${logo}" alt="FuelFlow" height="28" style="height:28px;width:auto" />
          <div style="font-weight:700;">FuelFlow</div>
        </div>

        <h1>Magic link to sign in</h1>
        <p>
          Hi, <strong>${email}</strong> — use the button below to securely sign in to your account.
        </p>

        <p class="center" style="margin:18px 0 22px">
          <a class="btn" href="${actionUrl}" target="_blank" rel="noopener">Log in</a>
        </p>

        <p class="muted">
          If the button doesn’t work in your mail client, click
          <a href="${actionUrl}" target="_blank" rel="noopener">this link</a>.
        </p>

        <div class="footer">
          © FuelFlow • <a href="${site}" style="color:#ffd54d" target="_blank" rel="noopener">${site.replace(/^https?:\/\//,'')}</a>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

function magicEmailText(actionUrl: string, _email: string) {
  return `Use the link below to sign in to your FuelFlow account.\n\n${actionUrl}\n`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email, captchaToken } = (req.body || {}) as { email?: string; captchaToken?: string };
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ error: "Valid email required" });
  }

  const captchaOk = await verifyHCaptcha(captchaToken);
  if (!captchaOk) return res.status(400).json({ error: "Captcha verification failed" });

  // Supabase admin client
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Build redirect target after the magic link completes auth
  const redirectTo = `${
    process.env.NEXT_PUBLIC_SITE_URL || "https://dashboard.fuelflow.co.uk"
  }/client-dashboard`;

  // Create a magic link (server-side) instead of letting Supabase send its default email
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  });

  if (error) return res.status(500).json({ error: error.message || "Failed to create magic link" });

  const actionUrl = (data as any)?.properties?.action_link || (data as any)?.action_link;
  if (!actionUrl) return res.status(500).json({ error: "No magic link returned" });

  // Send via nodemailer if SMTP is configured
  const nodemailer = getNodemailer();
  const hasSMTP =
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    (process.env.SMTP_PORT || "587");

  if (nodemailer && hasSMTP) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST!,
        port: Number(process.env.SMTP_PORT || 587),
        secure: Number(process.env.SMTP_PORT || 587) === 465,
        auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
      });

      const from = process.env.EMAIL_FROM || "FuelFlow <no-reply@fuelflow.co.uk>";
      const replyTo = process.env.EMAIL_REPLY_TO || "support@fuelflow.co.uk";

      await transporter.sendMail({
        from,
        to: email,
        replyTo,
        subject: "Your FuelFlow sign-in link",
        html: magicEmailHTML(actionUrl, email),
        text: magicEmailText(actionUrl, email),
      });

      return res.status(200).json({ ok: true, sent: true });
    } catch {
      // Fallback: return the link
      return res.status(200).json({ ok: true, sent: false, actionUrl });
    }
  }

  // No SMTP or nodemailer not present — return link to client
  return res.status(200).json({ ok: true, sent: false, actionUrl });
}
