// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import PDFDocument from "pdfkit";
import { Resend } from "resend";

/** ---------- Types (keep simple to avoid TS build issues) ---------- */
type LineItem = { description: string; qty: number; unitPrice: number };
type InvoicePayload = {
  invoiceNumber: string;
  issuedAt: string; // ISO date
  currency: string; // e.g. "GBP"
  company: { name: string; address: string };
  customer: { id: string; name: string; email: string; address: string };
  lines: LineItem[];
  notes?: string;
  email?: boolean; // true -> send email
};

/** ---------- Small helpers ---------- */
function safeString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function calcTotal(lines: LineItem[]): number {
  return lines.reduce((acc, l) => acc + l.qty * l.unitPrice, 0);
}

/** Render the invoice into the provided PDFKit document */
function renderInvoice(doc: any, p: InvoicePayload) {
  // Header
  doc.fontSize(20).text("INVOICE", { align: "right" });
  doc.moveDown(0.5);

  doc
    .fontSize(12)
    .text(`Invoice #: ${p.invoiceNumber}`, { align: "right" })
    .text(`Issued: ${new Date(p.issuedAt).toLocaleDateString()}`, { align: "right" });

  doc.moveDown();
  doc
    .fontSize(14)
    .text(p.company.name)
    .fontSize(10)
    .text(p.company.address);
  doc.moveDown(1);

  // Bill to
  doc
    .fontSize(12)
    .text("Bill To:", { underline: true })
    .moveDown(0.2)
    .fontSize(11)
    .text(p.customer.name)
    .text(p.customer.address);

  doc.moveDown(1);

  // Table header
  doc.fontSize(11).text("Description", 50).text("Qty", 350).text("Unit", 400).text("Amount", 470);
  doc.moveTo(50, doc.y + 2).lineTo(560, doc.y + 2).stroke();
  doc.moveDown(0.6);

  // Lines
  p.lines.forEach((l) => {
    const amount = l.qty * l.unitPrice;
    doc
      .fontSize(10)
      .text(l.description, 50)
      .text(l.qty.toString(), 350)
      .text(l.unitPrice.toFixed(2), 400)
      .text(amount.toFixed(2), 470);
    doc.moveDown(0.2);
  });

  doc.moveDown(0.6);
  doc.moveTo(50, doc.y + 2).lineTo(560, doc.y + 2).stroke();

  // Total
  const total = calcTotal(p.lines);
  doc
    .fontSize(12)
    .text("TOTAL", 400, doc.y + 8)
    .text(`${p.currency} ${total.toFixed(2)}`, 470, doc.y, { continued: false });

  if (p.notes) {
    doc.moveDown(2);
    doc.fontSize(10).text("Notes:", { underline: true }).moveDown(0.2).text(p.notes);
  }

  doc.end();
}

/** Create a PDF Buffer from invoice payload */
function pdfFromPayload(p: InvoicePayload): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc: any = new PDFDocument({ size: "A4", margin: 50 });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      renderInvoice(doc, p);
    } catch (err) {
      reject(err);
    }
  });
}

/** Email the PDF using Resend (attachments expect Buffer; no contentType) */
async function sendInvoiceEmail(pdf: Buffer, p: InvoicePayload): Promise<{ id?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;

  if (!apiKey) throw new Error("Missing RESEND_API_KEY");
  if (!from) throw new Error("Missing MAIL_FROM");

  const resend = new Resend(apiKey);
  const filename = `${p.invoiceNumber}.pdf`;
  const bcc = process.env.MAIL_BCC;

  const result = await resend.emails.send({
    from: from!,
    to: [p.customer.email],
    ...(bcc ? { bcc: [bcc] } : {}),
    subject: `Invoice ${p.invoiceNumber}`,
    text: `Hi ${p.customer.name},

Please find your invoice attached.

Thank you,
${p.company.name}`,
    attachments: [
      {
        filename,
        content: pdf, // Buffer is correct; do not set contentType
      },
    ],
  });

  return { id: (result as any)?.data?.id };
}

/** ---------- Route handler ---------- */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  try {
    const p = req.body as InvoicePayload;

    // light validation
    if (!p || !p.invoiceNumber || !p.customer?.email || !Array.isArray(p.lines) || !p.lines.length) {
      return res.status(400).json({ ok: false, error: "Invalid payload" });
    }

    const pdf = await pdfFromPayload(p);

    let emailId: string | undefined;
    if (p.email) {
      const sent = await sendInvoiceEmail(pdf, p);
      emailId = sent.id;
    }

    return res.status(200).json({
      ok: true,
      emailed: Boolean(p.email),
      emailId: emailId ?? null,
      bytes: pdf.length,
      route: "/api/invoices/create",
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ ok: false, error: safeString(err?.message, "Server error") });
  }
}

