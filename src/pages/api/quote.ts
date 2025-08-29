// src/pages/api/quote.ts
// src/pages/api/quote.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

/* ──────────────────────────────────────────────────────────
   Environment / config
   ────────────────────────────────────────────────────────── */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const DB_SCHEMA = process.env.DB_SCHEMA || "public";
const TABLE = process.env.QUOTE_TABLE || "tickets";

const SITE_URL = process.env.SITE_URL || "https://dashboard.fuelflow.co.uk";
const CLIENT_DASHBOARD_URL =
  process.env.CLIENT_DASHBOARD_URL || `${SITE_URL}/client-dashboard`;

// If you uploaded public/logo-email.png, you can leave this unset.
// If you want to force a fresh version, set EMAIL_LOGO_URL in Vercel, e.g.
// https://dashboard.fuelflow.co.uk/logo-email.png?v=2
const EMAIL_LOGO_URL =
  process.env.EMAIL_LOGO_URL || `${SITE_URL}/logo-email.png`;

// Resend email settings
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
// Example: 'FuelFlow <no-reply@mail.fuelflow.co.uk>'
const FROM_EMAIL = process.env.CONFIRMATION_FROM_EMAIL || "";
// Optional: internal notification copy
const INTERNAL_BCC = process.env.ORDERS_INBOX || undefined;

// hCaptcha secret
const HCAPTCHA_SECRET = process.env.HCAPTCHA_SECRET_KEY || "";

/* ──────────────────────────────────────────────────────────
   Supabase Admin Client (service role)
   ────────────────────────────────────────────────────────── */
const supabase = createClient(
  SUPABASE_URL || "",
  SUPABASE_SERVICE_ROLE_KEY || "",
  { db: { schema: DB_SCHEMA } }
);

/* ──────────────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────────────── */
const m = (e: any) =>
  e?.message || e?.details || e?.hint || e?.code || (typeof e === "string" ? e : JSON.stringify(e));

async function verifyHCaptcha(token: string, ip?: string) {
  const resp = await fetch("https://hcaptcha.com/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      secret: HCAPTCHA_SECRET,
      response: token || "",
      remoteip: ip || "",
    }),
  });
  return resp.json(); // { success:boolean, "error-codes"?[] }
}

/* ──────────────────────────────────────────────────────────
   Email bodies
   ────────────────────────────────────────────────────────── */
function buildEmailText(o: {
  name: string;
  fuel: "diesel" | "petrol";
  qty: number;
  postcode: string;
  preferred?: string | null;
  ref?: string;
}) {
  const lines = [
    `Hi ${o.name},`,
    ``,
    `Thanks for your enquiry. We've logged your request and will come back with pricing shortly.`,
    ``,
    `Fuel: ${o.fuel === "diesel" ? "Diesel" : "Petrol"}`,
    `Quantity: ${o.qty} L`,
    `Postcode: ${o.postcode}`,
    o.preferred ? `Preferred delivery: ${o.preferred}` : ``,
    o.ref ? `Reference: ${o.ref}` : ``,
    ``,
    `View your dashboard: ${CLIENT_DASHBOARD_URL}`,
    ``,
    `© ${new Date().getFullYear()} FuelFlow. You’re receiving this because you requested a quote.`,
  ].filter(Boolean);
  return lines.join("\n");
}

function buildEmailHTML(o: {
  name: string;
  fuel: "diesel" | "petrol";
  qty: number;
  postcode: string;
  preferred?: string | null;
  ref?: string;
}) {
  const brandBlue = "#041F3E";
  const panelBlue = "#0E2E57";
  const brandYellow = "#F5B800";
  const text = "#0B1220";
  const niceFuel = o.fuel === "diesel" ? "Diesel" : "Petrol";
  const preheader = "We received your quote request — we’ll get back with pricing shortly.";
  const year = new Date().getFullYear();

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
        <!-- header with logo -->
        <tr>
          <td style="background:${brandBlue};padding:24px;">
            <img src="${EMAIL_LOGO_URL}" alt="FuelFlow" width="160" height="40"
                 style="display:block;border:0;outline:none;text-decoration:none;width:160px;height:40px;">
          </td>
        </tr>

        <!-- body -->
        <tr>
          <td style="padding:28px 24px 8px 24px;">
            <h1 style="margin:0 0 12px 0;font:700 22px system-ui,-apple-system,Segoe UI,Roboto,Arial;color:${text};">
              Thanks — your quote request is in!
            </h1>
            <p style="margin:0 0 20px 0;font:400 15px system-ui,-apple-system,Segoe UI,Roboto,Arial;color:#46556A;">
              Hi ${o.name}, we’ve logged your request and our team will come back with pricing shortly.
            </p>
          </td>
        </tr>

        <!-- summary card -->
        <tr>
          <td style="padding:0 24px 8px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${panelBlue};border-radius:12px;">
              <tr><td style="padding:20px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  ${o.ref ? `
                  <tr>
                    <td style="font:600 12px system-ui,Segoe UI,Roboto,Arial;color:#A7B3C2;text-transform:uppercase;letter-spacing:.04em;padding:0 0 8px 0;">Reference</td>
                    <td style="font:500 14px system-ui,Segoe UI,Roboto,Arial;color:#ffffff;padding:0 0 8px 0;" align="right">${o.ref}</td>
                  </tr>` : ``}
                  <tr>
                    <td style="font:600 12px system-ui,Segoe UI,Roboto,Arial;color:#A7B3C2;text-transform:uppercase;letter-spacing:.04em;padding:6px 0;">Fuel</td>
                    <td style="font:500 14px system-ui,Segoe UI,Roboto,Arial;color:#ffffff;padding:6px 0;" align="right">${niceFuel}</td>
                  </tr>
                  <tr>
                    <td style="font:600 12px system-ui,Segoe UI,Roboto,Arial;color:#A7B3C2;text-transform:uppercase;letter-spacing:.04em;padding:6px 0;">Quantity</td>
                    <td style="font:500 14px system-ui,Segoe UI,Roboto,Arial;color:#ffffff;padding:6px 0;" align="right">${o.qty.toLocaleString()} L</td>
                  </tr>
                  <tr>
                    <td style="font:600 12px system-ui,Segoe UI,Roboto,Arial;color:#A7B3C2;text-transform:uppercase;letter-spacing:.04em;padding:6px 0;">Postcode</td>
                    <td style="font:500 14px system-ui,Segoe UI,Roboto,Arial;color:#ffffff;padding:6px 0;" align="right">${o.postcode}</td>
                  </tr>
                  ${o.preferred ? `
                  <tr>
                    <td style="font:600 12px system-ui,Segoe UI,Roboto,Arial;color:#A7B3C2;text-transform:uppercase;letter-spacing:.04em;padding:6px 0;">Preferred delivery</td>
                    <td style="font:500 14px system-ui,Segoe UI,Roboto,Arial;color:#ffffff;padding:6px 0;" align="right">${o.preferred}</td>
                  </tr>` : ``}
                </table>
              </td></tr>
            </table>
          </td>
        </tr>

        <!-- CTA + footer -->
        <tr>
          <td style="padding:16px 24px 24px 24px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td bgcolor="${brandYellow}" style="border-radius:10px;">
                  <a href="${CLIENT_DASHBOARD_URL}" target="_blank" rel="noopener"
                     style="display:inline-block;padding:12px 18px;border-radius:10px;background:${brandYellow};
                            color:${brandBlue};text-decoration:none;font:600 14px system-ui,Segoe UI,Roboto,Arial;">
                    View your dashboard
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:14px 0 0 0;font:400 12px system-ui,Segoe UI,Roboto,Arial;color:#6B7A90;">
              © ${year} FuelFlow. You’re receiving this because you requested a quote.
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

/* ──────────────────────────────────────────────────────────
   Send via Resend
   ────────────────────────────────────────────────────────── */
async function sendConfirmationEmail(opts: {
  to: string;
  name: string;
  fuel: "diesel" | "petrol";
  qty: number;
  postcode: string;
  preferred?: string | null;
  ref?: string;
}) {
  if (!RESEND_API_KEY || !FROM_EMAIL) return { sent: false, error: "missing_email_env" };

  const html = buildEmailHTML(opts);
  const text = buildEmailText({
    name: opts.name,
    fuel: opts.fuel,
    qty: opts.qty,
    postcode: opts.postcode,
    preferred: opts.preferred,
    ref: opts.ref,
  });

  const payload: any = {
    from: FROM_EMAIL,
    to: opts.to,
    subject: opts.ref
      ? `FuelFlow — quote request received (ref ${opts.ref})`
      : `FuelFlow — quote request received`,
    html,
    text,
    ...(INTERNAL_BCC ? { bcc: [INTERNAL_BCC] } : {}),
    // No `reply_to` so no-reply stays consistent
  };

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const errTxt = await resp.text().catch(() => "");
    return { sent: false, error: errTxt || `resend_http_${resp.status}` };
  }
  return { sent: true };
}

/* ──────────────────────────────────────────────────────────
   API handler
   ────────────────────────────────────────────────────────── */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    // Ensure table is reachable early
    const pre = await supabase.from(TABLE).select("id", { head: true, count: "exact" });
    if (pre.error) {
      console.error("Table check failed:", pre.error);
      return res.status(500).json({ error: `Table "${DB_SCHEMA}.${TABLE}" not reachable: ${m(pre.error)}` });
    }

    const { captchaToken, ...p } = req.body || {};
    const remoteIp =
      (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || undefined;

    // hCaptcha
    const cap = await verifyHCaptcha(captchaToken, remoteIp);
    if (!cap?.success) {
      const codes = Array.isArray(cap?.["error-codes"]) ? cap["error-codes"].join(", ") : "unknown";
      return res.status(400).json({ error: `Captcha failed (${codes}).` });
    }

    // Build record for DB
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
      user_agent: req.headers["user-agent"] || null,

      captcha_passed: true,
      status: "new" as const,
      is_portal_user: false,
    };

    // required fields
    if (!record.customer_name || !record.email || !record.phone || !record.postcode || !record.quantity_litres) {
      return res.status(400).json({ error: "Please complete all required fields." });
    }

    // Insert
    const ins = await supabase.from(TABLE).insert(record).select("id");
    if (ins.error) {
      console.error("Supabase insert error:", ins.error);
      return res.status(500).json({ error: `Database error: ${m(ins.error)}` });
    }

    const id: string | undefined = Array.isArray(ins.data) ? ins.data[0]?.id : (ins.data as any)?.id;
    if (!id) return res.status(500).json({ error: "Insert returned no id." });

    const ref = id.slice(0, 8);

    // Send confirmation email
    const emailResult = await sendConfirmationEmail({
      to: record.email,
      name: record.customer_name,
      fuel: record.fuel,
      qty: record.quantity_litres,
      postcode: record.postcode,
      preferred: record.preferred_delivery,
      ref,
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
      ref,
      emailSent: emailResult.sent,
      emailError: emailResult.sent ? undefined : emailResult.error,
    });
  } catch (e: any) {
    console.error("API /api/quote error:", e);
    return res.status(500).json({ error: `Server error: ${m(e)}` });
  }
}
