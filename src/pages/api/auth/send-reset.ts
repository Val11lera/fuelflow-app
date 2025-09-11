// src/pages/api/auth/send-reset.ts
// src/pages/api/auth/send-reset.ts
import type { NextApiRequest, NextApiResponse } from "next";
import * as nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";

/** Verify hCaptcha server-side (optional but recommended) */
async function verifyHCaptcha(token?: string) {
  const secret = process.env.HCAPTCHA_SECRET_KEY;
  if (!secret) return true; // no server check configured
  if (!token) return false;

  const body = new URLSearchParams({
    secret,
    response: token,
  }).toString();

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

/** Brand email HTML */
function resetEmailHTML(actionUrl: string, email: string) {
  const logo =
    process.env.EMAIL_LOGO_URL ||
    "https://dashboard.fuelflow.co.uk/logo-email.png";
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://fuelflow.co.uk";

  return `
  <!doctype html>
  <html>
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
      <meta name="color-scheme" content="light only">
      <title>Reset your password</title>
      <style>
        body { margin:0; background:#041F3E; font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,'Helvetica Neue',Arial,'Apple Color Emoji','Segoe UI Emoji'; }
        .wrap { max-width:680px; margin:0 auto; padding:28px 16px; }
        .card { background:#0E2444; border-radius:16px; padding:24px; border:1px solid rgba(255,255,255,0.08); }
        .header { display:flex; align-items:center; gap:10px; color:#fff; margin-bottom:12px; }
        .badge { width:28px; height:28px; border-radius:8px; background:linear-gradient(135deg,#ffb86c,#ff6a00); display:grid; place-items:center; color:#041F3E; font-weight:700; }
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

          <h1>Reset your password</h1>
          <p>
            We received a request to reset the password for <strong>${email}</strong>.
            If you didn’t request this, you can safely ignore this email.
          </p>

          <p class="center" style="margin:18px 0 22px">
            <a class="btn" href="${actionUrl}" target="_blank" rel="noopener">Set a new password</a>
          </p>

          <p class="muted">
            If the button doesn’t work in your mail client, click
            <a href="${actionUrl}" target="_blank" rel="noopener">this link</a>.
          </p>

          <div class="footer">
            © FuelFlow • Sent from <a href="${site}" style="color:#ffd54d" target="_blank" rel="noopener">${site.replace(/^https?:\/\//,'')}</a>
          </div>
        </div>
      </div>
    </body>
  </html>
`;
}

function resetEmailText(actionUrl: string, email: string) {
  return `We received a request to reset the password for ${email}.
If you didn’t request this, you can ignore this message.

Set a new password: ${actionUrl}
`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email, captchaToken } = (req.body || {}) as { email?: string; captchaToken?: string };
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ error: "Valid email required" });
  }

  // Optional hCaptcha verification
  const captchaOk = await verifyHCaptcha(captchaToken);
  if (!captchaOk) {
    return res.status(400).json({ error: "Captcha verification failed" });
  }

  // Supabase admin client (Service Role key — server only!)
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Generate a recovery link that lands on your custom page
  const redirectTo =
    `${process.env.NEXT_PUBLIC_SITE_URL || "https://dashboard.fuelflow.co.uk"}/update-password`;

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });

  if (error) {
    return res.status(500).json({ error: error.message || "Failed to generate reset link" });
  }

  const actionUrl =
    (data as any)?.properties?.action_link ||
    (data as any)?.action_link;

  if (!actionUrl) {
    return res.status(500).json({ error: "No action link returned" });
  }

  // SMTP transport
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST!,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: {
      user: process.env.SMTP_USER!,
      pass: process.env.SMTP_PASS!,
    },
  });

  const from = process.env.EMAIL_FROM || 'FuelFlow <no-reply@fuelflow.co.uk>';
  const replyTo = process.env.EMAIL_REPLY_TO || 'support@fuelflow.co.uk';

  await transporter.sendMail({
    from,
    to: email,
    replyTo,
    subject: "Reset your FuelFlow password",
    html: resetEmailHTML(actionUrl, email),
    text: resetEmailText(actionUrl, email),
  });

  return res.status(200).json({ ok: true });
}

