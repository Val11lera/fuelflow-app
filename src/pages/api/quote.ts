// src/pages/api/quote.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

/** ========= ENV / CONFIG ========= */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DB_SCHEMA = process.env.DB_SCHEMA || "public";
const TABLE = process.env.QUOTE_TABLE || "tickets"; // change via env if needed

// Public URLs for links/images in emails
const SITE_URL = process.env.SITE_URL || "https://dashboard.fuelflow.co.uk";
const EMAIL_LOGO_URL =
  process.env.EMAIL_LOGO_URL || `${SITE_URL}/logo-email.png`; // put /public/logo-email.png in your app

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Missing Supabase envs. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel."
  );
}

const supabase = createClient(
  SUPABASE_URL || "",
  SUPABASE_SERVICE_ROLE_KEY || "",
  { db: { schema: DB_SCHEMA } }
);

/** ========= SMALL HELPERS ========= */
const msg = (e: any) =>
  e?.message || e?.details || e?.hint || e?.code || (typeof e === "string" ? e : JSON.stringify(e));

async function verifyHCaptcha(token: string, ip?: string) {
  const r = await fetch("https://hcaptcha.com/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      secret: process.env.HCAPTCHA_SECRET_KEY || "",
      response: token || "",
      remoteip: ip || "",
    }),
  });
  return r.json(); // { success:boolean, "error-codes"?:string[] }
}

/** ========= EMAIL CONTENT (HTML + TEXT) ========= */

function buildQuoteEmailText(o: {
  customer_name: string;
  fuel: "diesel" | "petrol";
  quantity_litres: number;
  postcode: string;
  preferred_delivery?: string | null;
  ticket_ref?: string;
}) {
  const lines = [
    `Hi ${o.customer_name},`,
    ``,
    `Thanks for your enquiry. We've logged your request and will come back with pricing shortly.`,
    ``,
    `Fuel: ${o.fuel === "diesel" ? "Diesel" : "Petrol"}`,
    `Quantity: ${o.quantity_litres} L`,
    `Postcode: ${o.postcode}`,
    o.preferred_delivery ? `Preferred delivery: ${o.preferred_delivery}` : ``,
    o.ticket_ref ? `Reference: ${o.ticket_ref}` : ``,
    ``,
    `Manage or view your request: ${SITE_URL}`,
    ``,
    `— FuelFlow Team`,
  ].filter(Boolean);
  return lines.join("\n");
}

function buildQuoteEmailHTML(o: {
  customer_name: string;
  fuel: "diesel" | "petrol";
  quantity_litres: number;
  postcode: string;
  preferred_delivery?: string | null;
  ticket_ref?: string;
}) {
  const brandBlue = "#041F3E";
  const panelBlue = "#0E2E57";
  const brandYellow = "#F5B800";
  const textColor = "#0B1220";
  const niceFuel = o.fuel === "diesel" ? "Diesel" : "Petrol";
  const preheader =
    "We received your quote request — we’ll get back with pricing shortly.";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<title>FuelFlow — quote request received</title>
</head>
<body style="margin:0;padding:0;background:#f6f7fb;">
  <!-- preheader (hidden) -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7fb;">
    <tr><td align="center" style="padding:24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:16px;overflow:hidden;">
        <tr>
          <td style="background:${brandBlue};padding:24px;">
            <img src="${EMAIL_LOGO_URL}" alt="FuelFlow" height="40" style="display:block;border:0;outline:none;text-decoration:none;">
          </td>
        </tr>

        <tr>
          <td style="padding:28px 24px 8px 24px;">
            <h1 style="margin:0 0 12px 0;font:700 22px system-ui,-apple-system,Segoe UI,Roboto,Arial;color:${textColor};">
              Thanks — your quote request is in!
            </h1>
            <p style="margin:0 0 20px 0;font:400 15px system-ui,-apple-system,Segoe UI,Roboto,Arial;color:#46556A;">
              Hi ${o.customer_name}, we’ve logged your request and our team will come back with pricing shortly.
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:0 24px 8px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${panelBlue};border-radius:12px;">
              <tr><td style="padding:20px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  ${o.ticket_ref ? `
                  <tr>
                    <td style="font:600 12px system-ui,Segoe UI,Roboto,Arial;color:#A7B3C2;text-transform:uppercase;letter-spacing:.04em;padding:0 0 8px 0;">Reference</td>
                    <td style="font:500 14px system-ui,Segoe UI,Roboto,Arial;color:#ffffff;padding:0 0 8px 0;" align="right">${o.ticket_ref}</td>
                  </tr>` : ``}
                  <tr>
                    <td style="font:600 12px system-ui,Segoe UI,Roboto,Arial;color:#A7B3C2;text-transform:uppercase;letter-spacing:.04em;padding:6px 0;">Fuel</td>
                    <td style="font:500 14px system-ui,Segoe UI,Roboto,Arial;color:#ffffff;padding:6px 0;" align="right">${niceFuel}</td>
                  </tr>
                  <tr>
                    <td style="font:600 12px system-ui,Segoe UI,Roboto,Arial;color:#A7B3C2;text-transform:uppercase;letter-spacing:.04em;padding:6px 0;">Quantity</td>
                    <td style="font:500 14px system-ui,Segoe UI,Roboto,Arial;color:#ffffff;padding:6px 0;" align="right">${o.quantity_litres.toLocaleString()} L</td>
                  </tr>
                  <tr>
                    <td style="font:600 12px system-ui,Segoe UI,Roboto,Arial;color:#A7B3C2;text-transform:uppercase;letter-spacing:.04em;padding:6px 0;">Postcode</td>
                    <td style="font:500 14px system-ui,Segoe UI,Roboto,Arial;color:#ffffff;padding:6px 0;" align="right">${o.postcode}</td>
                  </tr>
                  ${o.preferred_delivery ? `
                  <tr>
                    <td style="font:600 12px system-ui,Segoe UI,Roboto,Arial;color:#A7B3C2;text-transform:uppercase;letter-spacing:.04em;padding:6px 0;">Preferred delivery</td>
                    <td style="font:500 14px system-ui,Segoe UI,Roboto,Arial;color:#ffffff;padding:6px 0;" align="right">${o.preferred_delivery}</td>
                  </tr>` : ``}
                </table>
              </td></tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:16px 24px 24px 24px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td bgcolor="${brandYellow}" style="border-radius:10px;">
                  <a href="${SITE_URL}" target="_blank" rel="noopener"
                     style="display:inline-block;padding:12px 18px;border-radius:10px;background:${brandYellow};color:${brandBlue};text-decoration:none;font:600 14px system-ui,Segoe UI,Roboto,Arial;">
                    View your dashboard
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:14px 0 0 0;font:400 12px system-ui,Segoe UI,Roboto,Arial;color:#6B7A90;">
              You’re receiving this because you requested a quote on FuelFlow. Need help? Reply to this email.
            </p>
          </td>
        </tr>
      </table>
      <div style="height:24px;"></div>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Send confirmation via Resend HTTP API */
async function sendConfirmationEmail(opts: {
  to: string;
  customer_name: string;
  fuel: "diesel" | "petrol";
  quantity_litres: number;
  postcode: string;
  preferred_delivery?: string | null;
  ticket_ref?: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CONFIRMATION_FROM_EMAIL; // e.g. FuelFlow <no-reply@mail.fuelflow.co.uk>
  const bcc = process.env.ORDERS_INBOX; // optional internal BCC

  if (!apiKey || !from) return { sent: false, error: "missing_email_env" };

  const html = buildQuoteEmailHTML(opts);
  const text = buildQuoteEmailText(opts);

  const payload: any = {
    from,
    to: opts.to,
    subject: opts.ticket_ref
      ? `FuelFlow — quote request received (ref ${opts.ticket_ref})`
      : `FuelFlow — quote request received`,
    html,
    text,
    reply_to: opts.to,
  };
  if (bcc) payload.bcc = [bcc];

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const errTxt = await resp.text().catch(() => "");
    return { sent: false, error: errTxt || `resend_http_${resp.status}` };
  }
  return { sent: true };
}

/** ========= API HANDLER ========= */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { captchaToken, ...p } = req.body || {};
    const remoteIp =
      (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || undefined;

    // 0) Table reachability
    const pre = await supabase.from(TABLE).select("id", { head: true, count: "exact" });
    if (pre.error) {
      console.error("Preflight table check failed:", pre.error);
      return res.status(500).json({
        error: `Table "${DB_SCHEMA}.${TABLE}" not reachable: ${msg(pre.error)}`
      });
    }

    // 1) Captcha
    const captcha = await verifyHCaptcha(captchaToken, remoteIp);
    if (!captcha?.success) {
      const codes = Array.isArray(captcha?.["error-codes"]) ? captcha["error-codes"].join(", ") : "unknown";
      return res.status(400).json({ error: `Captcha failed (${codes}).` });
    }

    // 2) Build insert record
    const record = {
      customer_name: String(p.customer_name || "").trim(),
      email: String(p.email || "").trim().toLowerCase(),
      phone: String(p.phone || "").trim(),
      customer_type: p.customer_type === "business" ? "business" : "residential",
      company_name: p.company_name || null,

      postcode: String(p.postcode || "").trim().toUpperCase(),
      city: p.city || null,

      fuel: (p.fuel === "petrol" ? "petrol" : "diesel") as "diesel" | "petrol",
      quantity_litres: Number(p.quantity_litres || 0),
      urgency: ["asap", "this_week", "flexible"].includes(p.urgency) ? p.urgency : "flexible",
      preferred_delivery: p.preferred_delivery || null,

      use_case: p.use_case || null,
      access_notes: p.access_notes || null,
      notes: p.notes || null,
      marketing_opt_in: !!p.marketing_opt_in,

      utm: {
        source: (req.query.utm_source as string) || null,
        medium: (req.query.utm_medium as string) || null,
        campaign: (req.query.utm_campaign as string) || null,
      },
      ip: ((req.headers["x-forwarded-for"] as string) || "").split(",")[0].trim(),
      user_agent: req.headers["user-agent"],
      captcha_passed: true,
      status: "new" as const,
      is_portal_user: false,
    };

    if (!record.customer_name || !record.email || !record.phone || !record.postcode || !record.quantity_litres) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    // 3) Insert ticket
    const result = await supabase.from(TABLE).insert(record).select("id");
    const { data, error } = result as any;

    if (error) {
      console.error("Supabase insert error:", error);
      return res.status(500).json({ error: `Database error: ${msg(error)}` });
    }

    const id: string | undefined = Array.isArray(data) ? data[0]?.id : data?.id;
    if (!id) return res.status(500).json({ error: "Insert returned no id." });

    const ticketRef = id.slice(0, 8);

    // 4) Send email and write back result
    const emailResult = await sendConfirmationEmail({
      to: record.email,
      customer_name: record.customer_name,
      fuel: record.fuel,
      quantity_litres: record.quantity_litres,
      postcode: record.postcode,
      preferred_delivery: record.preferred_delivery,
      ticket_ref: ticketRef,
    });

    if (emailResult.sent) {
      await supabase.from(TABLE)
        .update({ email_confirmation_sent_at: new Date().toISOString(), email_error: null })
        .eq("id", id);
    } else {
      await supabase.from(TABLE)
        .update({ email_error: emailResult.error ?? "unknown" })
        .eq("id", id);
    }

    return res.status(200).json({
      ok: true,
      id,
      ticketRef,
      emailSent: emailResult.sent,
      emailError: emailResult.sent ? undefined : emailResult.error,
    });
  } catch (e: any) {
    console.error("API /api/quote fatal error:", e);
    return res.status(500).json({ error: `Server error: ${msg(e)}` });
  }
}

