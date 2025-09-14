// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import PDFDocument from "pdfkit";
import { Resend } from "resend";

/** ---- Types for the incoming payload ---- */
type InvoiceLine = {
  description: string;
  qty: number;
  unitPrice: number;
};

type InvoicePayload = {
  invoiceNumber: string;
  issuedAt: string;                 // ISO string
  currency: string;                 // e.g. "GBP"
  company: { name: string; address: string };
  customer: { id: string; name: string; email: string; address: string };
  lines: InvoiceLine[];
  notes?: string;
  email?: boolean;                  // if true, we email the PDF
};

/** ---- Helper: build a PDF buffer from payload ---- */
function renderInvoice(doc: any, p: InvoicePayload) {
  doc.fontSize(22).text("INVOICE", { align: "right" }).moveDown();

  doc.fontSize(12);
  doc.text(p.company.name);
  doc.text(p.company.address);
  doc.moveDown();

  doc.text(`Invoice: ${p.invoiceNumber}`);
  doc.text(`Date:    ${new Date(p.issuedAt).toDateString()}`);
  doc.text(`Bill to: ${p.customer.name}`);
  doc.text(p.customer.address);
  doc.moveDown();

  // Table header
  doc.font("Helvetica-Bold");
  doc.text("Description", 50, doc.y, { continued: true });
  doc.text("Qty", 300, undefined, { continued: true });
  doc.text("Unit", 350, undefined, { continued: true });
  doc.text("Line", 420);
  doc.moveDown(0.5);
  doc.font("Helvetica");

  let total = 0;
  p.lines.forEach((l) => {
    const line = l.qty * l.unitPrice;
    total += line;

    doc.text(l.description, 50, doc.y, { continued: true });
    doc.text(l.qty.toString(), 300, undefined, { continued: true });
    doc.text(l.unitPrice.toFixed(2), 350, undefined, { continued: true });
    doc.text(line.toFixed(2), 420);
  });

  doc.moveDown();
  doc.font("Helvetica-Bold").text(`Total (${p.currency}): ${total.toFixed(2)}`, { align: "right" });
  doc.font("Helvetica");

  if (p.notes) {
    doc.moveDown();
    doc.text(p.notes);
  }
}

async function pdfFromPayload(p: InvoicePayload): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    renderInvoice(doc, p);
    doc.end();
  });
}

/** ---- Email via Resend (optional) ---- */
async function emailInvoiceWithResend(
  pdf: Buffer,
  p: InvoicePayload
): Promise<{ id?: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { error: "RESEND_API_KEY not set" };

  // Use a verified sender domain. If you haven't verified yet, use the onboarding sender:
  const from = process.env.MAIL_FROM || "onboarding@resend.dev";
  const bcc = process.env.MAIL_BCC;

  try {
    const resend = new Resend(apiKey);
    const filename = `${p.invoiceNumber}.pdf`;

    const result = await resend.emails.send({
      from,
      to: [p.customer.email],
      bcc: bcc ? [bcc] : undefined,
      subject: `Invoice ${p.invoiceNumber}`,
      text: `Hi ${p.customer.name},\n\nPlease find your invoice attached.\n\nThanks,\n${p.company.name}`,
      attachments: [
        {
          filename,
          // Resend accepts Buffer or base64 string. Buffer is easiest here:
          content: pdf, // no contentType for Resend
        },
      ],
    });

    if (result.error) return { error: result.error.message };
    return { id: result.data?.id };
  } catch (err: any) {
    return { error: err?.message || String(err) };
  }
}

/** ---- API handler ---- */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, route: "/api/invoices/create" });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, GET");
    return res.status(405).end("Method Not Allowed");
  }

  try {
    const payload: InvoicePayload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!payload?.invoiceNumber) {
      return res.status(400).json({ ok: false, error: "Missing invoiceNumber" });
    }

    const pdf = await pdfFromPayload(payload);
    let emailId: string | undefined;
    let emailError: string | undefined;

    if (payload.email) {
      const sent = await emailInvoiceWithResend(pdf, payload);
      emailId = sent.id;
      emailError = sent.error;
      // Helpful server logs while testing:
      console.log("Email attempt:", { emailId, emailError, to: payload.customer.email });
    }

    // Always return JSON (never return the raw PDF to curl), so you see errors clearly.
    return res.status(200).json({
      ok: true,
      emailed: Boolean(emailId) && !emailError,
      emailId: emailId || null,
      emailError: emailError || null,
      filename: `${payload.invoiceNumber}.pdf`,
      size: pdf.length,
    });
  } catch (err: any) {
    console.error("Create invoice error:", err);
    return res.status(500).json({ ok: false, error: err?.message || "Unknown error" });
  }
}

