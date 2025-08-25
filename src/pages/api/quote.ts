import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // server-only service role
);

// Email is optional – route still works if these are not set
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { captchaToken, ...p } = req.body || {};

    // 1) Captcha
    const remoteIp = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || undefined;
    const captcha = await verifyHCaptcha(captchaToken, remoteIp);
    if (!captcha?.success) return res.status(400).json({ error: "Captcha failed." });

    // 2) Prepare record
    const record = {
      customer_name: String(p.customer_name || "").trim(),
      email: String(p.email || "").trim().toLowerCase(),
      phone: String(p.phone || "").trim(),
      customer_type: p.customer_type === "business" ? "business" : "residential",
      company_name: p.company_name || null,
      postcode: String(p.postcode || "").trim().toUpperCase(),
      city: p.city || null,
      fuel: p.fuel === "petrol" ? "petrol" : "diesel",
      quantity_litres: Number(p.quantity_litres || 0),
      urgency: ["asap","this_week","flexible"].includes(p.urgency) ? p.urgency : "flexible",
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

    // 3) Insert into Supabase
    const { data, error } = await supabase.from("tickets").insert(record).select("id").single();
    if (error) throw error;

    // 4) Send confirmation email (optional; errors won’t fail request)
    let emailSent = false;
    let emailError: string | null = null;
    if (resend && process.env.CONFIRMATION_FROM_EMAIL) {
      try {
        await resend.emails.send({
          from: process.env.CONFIRMATION_FROM_EMAIL!,
          to: record.email,
          subject: "FuelFlow: your quote request has been received",
          html: `
            <p>Hi ${record.customer_name},</p>
            <p>Thanks for your enquiry. We've logged your request and will come back with pricing shortly.</p>
            <ul>
              <li><strong>Fuel:</strong> ${record.fuel === "diesel" ? "Diesel" : "Petrol"}</li>
              <li><strong>Quantity:</strong> ${record.quantity_litres} L</li>
              <li><strong>Postcode:</strong> ${record.postcode}</li>
              ${record.preferred_delivery ? `<li><strong>Preferred delivery:</strong> ${record.preferred_delivery}</li>` : ""}
            </ul>
            <p>— FuelFlow Team</p>
          `,
        });
        emailSent = true;
        await supabase.from("tickets").update({ email_confirmation_sent_at: new Date().toISOString() }).eq("id", data.id);
      } catch (e: any) {
        emailError = e?.message || "email failed";
      }
    }

    return res.status(200).json({ ok: true, id: data.id, emailSent, emailError: emailError || undefined });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: "Server error." });
  }
}

