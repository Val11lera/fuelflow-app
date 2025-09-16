// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import PDFDocument from "pdfkit";
import { supabase } from "@/lib/supabase";         // <— IMPORTANT
import { sendInvoiceEmail } from "@/lib/mailer";

type Line = { description: string; qty: number; unitPrice: number };
type InvoicePayload = {
  company: { name: string; address?: string };
  customer: { name: string; email?: string; address?: string };
  lines: Line[];
  notes?: string;
  email?: boolean;
  to?: string;
};

/* ... your renderInvoice() + makePdfBuffer() stay the same ... */

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(200).json({ ok: true, route: "/api/invoices/create" });
  }

  const p = req.body as InvoicePayload;

  if (!p?.company?.name || !p?.customer?.name || !Array.isArray(p?.lines) || p.lines.length === 0) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const pdfBuffer = await makePdfBuffer(p);
  const filename = `INV-${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0,14)}.pdf`;

  // Optional: email
  let emailed = false;
  let emailError: string | undefined;
  if (p.email) {
    const to = p.to ?? p.customer.email;
    const from = process.env.MAIL_FROM;
    if (!to || !from) {
      return res.status(400).json({ error: "Missing email recipient or MAIL_FROM env var" });
    }
    const base64 = pdfBuffer.toString("base64");
    const subject = `${p.company.name} Invoice`;
    const html = `<p>Hi ${p.customer.name},</p><p>Attached is your invoice from ${p.company.name}.</p>`;

    const r = await sendInvoiceEmail({
      to,
      from,
      subject,
      html,
      pdfFilename: filename,
      pdfBase64: base64,
    });
    emailed = r.ok;
    if (!r.ok) emailError = r.error;
  }

  // ⬇️ Insert into Supabase
  const total = p.lines.reduce((acc, l) => acc + l.qty * l.unitPrice, 0);
  const { error: dbError } = await supabase.from("invoices").insert({
    company_name: p.company.name,
    customer_name: p.customer.name,
    customer_email: p.customer.email ?? null,
    total_cents: Math.round(total * 100),
    pdf_filename: filename,
    emailed,
    payload: p,
  });
  if (dbError) {
    console.error("Supabase insert error:", dbError);
  } else {
    console.log("Inserted invoice row:", filename);
  }

  // Respond JSON by default
  return res.status(200).json({
    ok: true,
    filename,
    emailed,
    ...(emailError ? { emailError } : {}),
  });
}
