// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import PDFDocument from "pdfkit";
import nodemailer from "nodemailer";

/** Payload types kept simple to avoid pdfkit type issues */
type Party = { name: string; address?: string; email?: string };
type Line  = { description: string; qty: number; unitPrice: number };
type InvoicePayload = {
  invoiceNumber: string;
  issuedAt: string;
  currency: string;
  company: Party;
  customer: Party & { id?: string };
  lines: Line[];
  notes?: string;
  email?: boolean; // when true we email the PDF
};

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, route: "/api/invoices/create" });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).end("Method Not Allowed");
  }

  try {
    const p = req.body as InvoicePayload;

    // Very light validation
    if (!p?.invoiceNumber || !p?.company?.name || !p?.customer?.email || !Array.isArray(p?.lines)) {
      return res.status(400).json({ ok: false, error: "Invalid payload" });
    }

    // 1) Build PDF in memory
    const pdfBuffer = await buildInvoicePdf(p);

    // 2) Email if requested (email defaults to true if not provided)
    const shouldEmail = p.email !== false;
    let messageId: string | undefined;

    if (shouldEmail) {
      const info = await sendInvoiceEmail({
        to: p.customer.email!,
        from: process.env.INVOICE_FROM_EMAIL || process.env.MAIL_FROM || "noreply@example.com",
        bcc: process.env.MAIL_BCC || "",
        subject: `Invoice ${p.invoiceNumber} — ${p.company.name}`,
        html: `
          <p>Hi ${p.customer.name || "there"},</p>
          <p>Thanks for your business. Please find your invoice attached.</p>
          <p>Invoice: <strong>${p.invoiceNumber}</strong><br/>
             Date: ${new Date(p.issuedAt || Date.now()).toLocaleDateString()}</p>
          <p>— ${p.company.name}</p>
        `,
        attachmentName: `${p.invoiceNumber}.pdf`,
        attachment: pdfBuffer,
      });
      messageId = info.messageId;
      console.log("EMAIL_SENT", { to: p.customer.email, messageId });
    } else {
      console.log("EMAIL_SKIPPED");
    }

    // 3) Respond
    return res.status(200).json({
      ok: true,
      emailed: shouldEmail,
      messageId: messageId || null,
    });
  } catch (err: any) {
    console.error("INVOICE_CREATE_ERROR", err);
    return res.status(500).json({ ok: false, error: err?.message || "Server error" });
  }
}

/** Create a PDF buffer from the invoice data (no pdfkit types referenced) */
function buildInvoicePdf(p: InvoicePayload): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc: any = new (PDFDocument as any)({ size: "A4", margin: 36 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Header
    doc.fontSize(22).text("INVOICE", { align: "right" }).moveDown();

    doc.fontSize(12)
      .text(p.company.name)
      .text(p.company.address || "")
      .moveDown();

    doc.text(`Invoice #: ${p.invoiceNumber}`)
      .text(`Issued: ${new Date(p.issuedAt || Date.now()).toLocaleDateString()}`)
      .moveDown();

    doc.text(`${p.customer.name || ""}`)
      .text(p.customer.address || "")
      .moveDown();

    // Lines
    doc.moveDown().fontSize(12);
    doc.text("Description", 36, doc.y, { continued: true })
      .text("Qty", 300, doc.y, { continued: true })
      .text("Unit", 350, doc.y, { continued: true })
      .text("Total", 430);

    doc.moveTo(36, doc.y + 2).lineTo(560, doc.y + 2).stroke();

    let grand = 0;
    p.lines.forEach((l) => {
      const lineTotal = l.qty * l.unitPrice;
      grand += lineTotal;
      doc.text(l.description, 36, doc.y + 6, { continued: true })
        .text(l.qty.toString(), 300, doc.y, { continued: true })
        .text(money(l.unitPrice, p.currency), 350, doc.y, { continued: true })
        .text(money(lineTotal, p.currency), 430);
    });

    doc.moveDown().moveTo(36, doc.y).lineTo(560, doc.y).stroke();
    doc.fontSize(14).text(`Total: ${money(grand, p.currency)}`, { align: "right" });

    if (p.notes) {
      doc.moveDown().fontSize(10).text(p.notes);
    }

    doc.end();
  });
}

function money(n: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

/** Send email via SMTP using env vars */
async function sendInvoiceEmail(opts: {
  to: string;
  from: string;
  bcc?: string;
  subject: string;
  html: string;
  attachmentName: string;
  attachment: Buffer;
}) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: (process.env.SMTP_SECURE || "false").toLowerCase() === "true",
    auth: {
      user: process.env.SMTP_USER!,
      pass: process.env.SMTP_PASS!,
    },
  });

  return transporter.sendMail({
    from: opts.from,
    to: opts.to,
    bcc: opts.bcc || undefined,
    subject: opts.subject,
    html: opts.html,
    attachments: [
      {
        filename: opts.attachmentName,
        content: opts.attachment,
        contentType: "application/pdf",
      },
    ],
  });
}

