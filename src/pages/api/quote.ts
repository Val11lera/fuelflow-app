import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

// Supabase (server-only service role)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// hCaptcha verify
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
  return r.json();
}

// Confirmation email via Resend HTTP API (no npm package)
// If RESEND_API_KEY or CONFIRMATION_FROM_EMAIL is missing, we skip email.
async function sendConfirmationEmail(opts: {
  to: string;
  customer_name: string;
  fuel: "diesel" | "petrol";
  quantity_litres: number;
  postcode: string;
  preferred_delivery?: string | null;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CONFIRMATION_FROM_EMAIL;
  if (!apiKey || !from) return { sent: false, error: "missing_email_env" };

  const html = `
    <p>Hi ${opts.customer_name},</p>
    <p>Thanks for your enquiry. We've logged your request and will come back with pricing shortly.</p>
    <ul>
      <li><strong>Fuel:</strong> ${opts.fuel === "diesel" ? "Diesel" : "Petrol"}</li>
      <li><strong>Quantity:</strong> ${opts.quantity_litres} L</li>
      <li><strong>Postcode:</strong> ${opts.postcode}</li>
      ${opts.preferred_delivery ? `<li><strong>Preferred delivery:</strong> ${opts.preferred_delivery}</li>` : ""}
    </ul>
    <p>— FuelFlow Team</p>
  `;

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: opts.to,
      subject: "FuelFlow: your quote request has been received",
      html,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => "");
    return { sent: false, error: err || `resend_http_${resp.status}` };
  }
  return { sent: true };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { captchaToken, ...p } = req.body || {};
    const remoteIp = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || undefined;

    // 1) Captcha
    const captcha = await verifyHCaptcha(captchaToken, remoteIp);
    if (!captcha?.success) return res.status(400).json({ error: "Captcha failed. Check hCaptcha domain & secret." });

    // 2) Shape record
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
    const { data, error } = await supabase.from("tickets").insert(record).select("id").single();
    if (error) return res.status(500).json({ error: `Database error: ${error.message}` });

    // 4) Email (optional)
    const emailResult = await sendConfirmationEmail({
      to: record.email,
      customer_name: record.customer_name,
      fuel: record.fuel,
      quantity_litres: record.quantity_litres,
      postcode: record.postcode,
      preferred_delivery: record.preferred_delivery,
    });

    if (emailResult.sent) {
      await supabase
        .from("tickets")
        .update({ email_confirmation_sent_at: new Date().toISOString() })
        .eq("id", data.id);
    }

    return res.status(200).json({
      ok: true,
      id: data.id,
      emailSent: emailResult.sent,
      emailError: emailResult.sent ? undefined : emailResult.error,
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: "Server error." });
  }
}


