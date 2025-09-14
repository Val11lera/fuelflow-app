// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import nodemailer from "nodemailer";
// @ts-ignore – we don't rely on pdfkit's TS types to avoid build errors
import PDFDocument from "pdfkit";

type InvoiceLine = { description: string; qty: number; unitPrice: number };
type InvoicePayload = {
  invoiceNumber: string;
  issuedAt: string;
  currency: string;
  company: { name: string; address?: string };
  customer: { name: string; email?: string; address?: string };
  lines: InvoiceLine[];
  notes?: string;
  email?: boolean; // <- the switch
};

function renderInvoiceToBuffer(p: InvoicePayload): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc: any = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    doc.fontSize(22).text("INVOICE", { align: "right" }).moveDown();

    doc
      .fontSize(12)
      .text(`Invoice #: ${p.invoiceNumber}`)
      .text(`Issued at: ${new Date(p.issuedAt).toUTCString()}`)
      .text(`Currency: ${p.currency}`)
      .moveDown();

    doc.text(`${p.company.name}`);
    if (p.company.address) doc.text(p.company.address);
    doc.moveDown();

    doc.text(`Bill To: ${p.customer.name}`);
    if (p.customer.address) doc.text(p.customer.address);
    if (p.customer.email) doc.text(p.customer.email);
    doc.moveDown();

    doc.text("Items:").moveDown(0.5);

    let total = 0;
    p.lines.forEach((l) => {
      const line = `${l.description}  x${l.qty}  @ ${l.unitPrice.toFixed(2)}`;
      const amount = l.qty * l.unitPrice;
      total += amount;
      doc.text(`${line}  —  ${amount.toFixed(2)} ${p.currency}`);
    });

    doc.moveDown();
    doc.fontSize(14).text(`Total: ${total.toFixed(2)} ${p.currency}`, { align: "right" });
    doc.moveDown();

    if (p.notes) {
      doc.fontSize(12).text("Notes:").moveDown(0.3).text(p.notes);
    }

    doc.end();
  });
}

async function sendInvoiceEmail(pdf: Buffer, p: InvoicePayload) {
  const host = process.env.SMTP_HOST!;
  const port = Number(process.env.SMTP_PORT || "587");
  const secure = String(process.env.SMTP_SECURE || "false") === "true";
  const user = process.env.SMTP_USER!;
  const pass = process.env.SMTP_PASS!;
  const from = process.env.MAIL_FROM || `FuelFlow <noreply@fuelflow.local>`;
  const bcc = process.env.MAIL_BCC;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass }
  });

  const to = p.customer.email || process.env.INVOICE_FROM_EMAIL || from;
  const subject = `Invoice ${p.invoiceNumber}`;
  const text = `Hi ${p.customer.name},\n\nPlease find attached your invoice ${p.invoiceNumber}.\n\nThanks,\nFuelFlow`;

  const info = await transporter.sendMail({
    from,
    to,
    bcc,
    subject,
    text,
    attachments: [
      {
        filename: `${p.invoiceNumber}.pdf`,
        content: pdf,
        contentType: "application/pdf"
      }
    ]
  });

  return info.messageId;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  try {
    const payload = req.body as InvoicePayload;

    const pdf = await renderInvoiceToBuffer(payload);

    let emailed = false;
    if (payload.email === true) {
      const messageId = await sendInvoiceEmail(pdf, payload);
      console.log("EMAIL_SENT", { to: payload.customer.email, messageId });
      emailed = true;
    }

    return res.status(200).json({ ok: true, emailed });
  } catch (err: any) {
    console.error("CREATE_INVOICE_ERROR", err);
    return res.status(500).json({ ok: false, error: err?.message || "Server error" });
  }
}
