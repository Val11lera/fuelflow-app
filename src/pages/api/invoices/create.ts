// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import PDFDocument from "pdfkit";
import nodemailer from "nodemailer";

// ---- Types ----
type Line = { description: string; qty: number; unitPrice: number };
type InvoicePayload = {
  invoiceNumber?: string;
  issuedAt?: string;               // ISO
  currency?: string;               // e.g. "GBP"
  company: { name: string; address?: string };
  customer: { name: string; email: string; address?: string };
  lines: Line[];
  notes?: string;
  email?: boolean;                 // if true, email the PDF
};

// ---- Helper: make a PDF and return it as a Buffer ----
function renderInvoiceToBuffer(p: InvoicePayload): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 36 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    const currency = p.currency ?? "GBP";
    const invNo = p.invoiceNumber ?? "INV-" + Date.now();
    const issued = p.issuedAt
      ? new Date(p.issuedAt).toLocaleString()
      : new Date().toLocaleString();

    // Header
    doc.fontSize(22).text("INVOICE", { align: "right" }).moveDown();
    doc.fontSize(12);
    doc.text(p.company.name);
    if (p.company.address) doc.text(p.company.address);
    doc.moveDown(0.5);
    doc.text(`Invoice #: ${invNo}`);
    doc.text(`Issued: ${issued}`);
    doc.moveDown();

    // Bill to
    doc.fontSize(14).text("Bill To").moveDown(0.2);
    doc.fontSize(12);
    doc.text(p.customer.name);
    if (p.customer.address) doc.text(p.customer.address);
    doc.moveDown();

    // Table-like lines
    doc.fontSize(12).text("Description", 36, doc.y, { continued: true });
    doc.text("Qty", 320, undefined, { continued: true });
    doc.text("Unit", 370, undefined, { continued: true });
    doc.text("Line", 450);
    doc.moveTo(36, doc.y).lineTo(559, doc.y).stroke();
    let total = 0;
    p.lines.forEach((l) => {
      const lineTotal = l.qty * l.unitPrice;
      total += lineTotal;
      doc.text(l.description, 36, doc.y + 6, { continued: true });
      doc.text(String(l.qty), 320, undefined, { continued: true });
      doc.text(l.unitPrice.toFixed(2) + " " + currency, 370, undefined, {
        continued: true,
      });
      doc.text(lineTotal.toFixed(2) + " " + currency, 450);
    });

    doc.moveDown();
    doc.fontSize(12).text(`Total: ${total.toFixed(2)} ${currency}`, {
      align: "right",
    });

    if (p.notes) {
      doc.moveDown().fontSize(11).text(`Notes: ${p.notes}`);
    }

    doc.end();
  });
}

// ---- Helper: nodemailer transport ----
function buildTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? "587");
  const secure = String(process.env.SMTP_SECURE ?? "false") === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      "SMTP env vars missing. Require SMTP_HOST, SMTP_USER, SMTP_PASS (and optionally SMTP_PORT/SMTP_SECURE)."
    );
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

// ---- API handler ----
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  try {
    const p = req.body as InvoicePayload;

    if (!p?.company?.name || !p?.customer?.email || !Array.isArray(p.lines)) {
      return res.status(400).json({ ok: false, error: "Bad payload" });
    }

    // 1) Build PDF
    const pdf = await renderInvoiceToBuffer(p);
    const fileName = `${p.invoiceNumber ?? "invoice"}.pdf`;

    // 2) Send email if requested
    let emailInfo: any = null;
    if (p.email) {
      const from = process.env.MAIL_FROM || process.env.SMTP_USER!;
      const bcc = process.env.MAIL_BCC;
      const subject = `Invoice ${p.invoiceNumber ?? ""}`.trim() || "Invoice";

      const transport = buildTransport();
      emailInfo = await transport.sendMail({
        from,
        to: p.customer.email,
        ...(bcc ? { bcc } : {}),
        subject,
        text:
          `Hi ${p.customer.name},\n\nPlease find your invoice attached.\n\nRegards,\n${p.company.name}`,
        html: `<p>Hi ${p.customer.name},</p><p>Please find your invoice attached.</p><p>Regards,<br/>${p.company.name}</p>`,
        attachments: [
          {
            filename: fileName,
            content: pdf, // Buffer
            // contentType omitted—Nodemailer will infer from filename
          },
        ],
      });

      // Useful logs in Terminal 1
      // (Don't expose in response)
      // eslint-disable-next-line no-console
      console.log("✉️  Email messageId:", emailInfo.messageId);
      // eslint-disable-next-line no-console
      console.log("   accepted:", emailInfo.accepted, "rejected:", emailInfo.rejected);
    }

    // 3) Respond with JSON (no PDF streamed to client)
    return res.status(200).json({
      ok: true,
      emailed: Boolean(p.email),
      messageId: emailInfo?.messageId ?? null,
    });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error("Create invoice error:", err);
    return res.status(500).json({ ok: false, error: err?.message ?? "Error" });
  }
}

