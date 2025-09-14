// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";

type Line = { description: string; qty: number; unitPrice: number };
type Party = { name: string; email?: string; address?: string };
type InvoicePayload = {
  invoiceNumber: string;
  issuedAt: string;            // ISO string
  currency: string;            // e.g. "GBP"
  company: Party;
  customer: Party;
  lines: Line[];
  notes?: string;
  email?: boolean;             // if true we will send an email
};

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Build a PDF into a Buffer */
function buildPdf(p: InvoicePayload): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });

    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    // --- header
    doc.fontSize(22).text("INVOICE", { align: "right" }).moveDown();
    doc
      .fontSize(12)
      .text(p.company.name)
      .text(p.company.address || "")
      .moveDown();

    doc
      .text(`Invoice #: ${p.invoiceNumber}`)
      .text(`Issued: ${new Date(p.issuedAt).toLocaleDateString()}`)
      .moveDown();

    // --- bill to
    doc.fontSize(12).text("Bill To:", { underline: true });
    doc.text(p.customer.name);
    if (p.customer.address) doc.text(p.customer.address);
    if (p.customer.email) doc.text(p.customer.email);
    doc.moveDown();

    // --- table
    const tableTop = doc.y;
    doc.fontSize(12).text("Description", 50, tableTop);
    doc.text("Qty", 350, tableTop);
    doc.text("Unit", 400, tableTop, { width: 80, align: "right" });
    doc.text("Line", 500, tableTop, { width: 80, align: "right" });
    doc.moveDown();

    let total = 0;
    p.lines.forEach((l) => {
      const line = l.qty * l.unitPrice;
      total += line;

      doc.text(l.description, 50);
      doc.text(String(l.qty), 350);
      doc.text(formatCurrency(l.unitPrice, p.currency), 400, undefined, {
        width: 80,
        align: "right",
      });
      doc.text(formatCurrency(line, p.currency), 500, undefined, {
        width: 80,
        align: "right",
      });
      doc.moveDown();
    });

    doc.moveDown();
    doc.fontSize(13).text(`Total: ${formatCurrency(total, p.currency)}`, {
      align: "right",
    });

    if (p.notes) {
      doc.moveDown().fontSize(11).text(p.notes);
    }

    doc.end();
  });
}

async function sendEmailWithPdf(
  p: InvoicePayload,
  pdfBuffer: Buffer
): Promise<void> {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = String(process.env.SMTP_SECURE) === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.MAIL_FROM || user;
  const bcc = process.env.MAIL_BCC || undefined;

  if (!host || !user || !pass) {
    throw new Error("SMTP environment variables are missing");
  }
  if (!p.customer.email) {
    throw new Error("Customer email is missing in payload");
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  const filename = `${p.invoiceNumber}.pdf`;
  const subject = `Invoice ${p.invoiceNumber}`;
  const total = p.lines.reduce((acc, l) => acc + l.qty * l.unitPrice, 0);
  const totalFmt = formatCurrency(total, p.currency);

  await transporter.sendMail({
    from,
    to: p.customer.email,
    bcc,
    subject,
    text: `Hello ${p.customer.name},

Please find attached your invoice ${p.invoiceNumber} totaling ${totalFmt}.

Thank you,
${p.company.name}
    `,
    html: `<p>Hello ${p.customer.name},</p>
<p>Please find attached your invoice <strong>${p.invoiceNumber}</strong> totaling <strong>${totalFmt}</strong>.</p>
<p>Thank you,<br/>${p.company.name}</p>`,
    attachments: [
      {
        filename,
        content: pdfBuffer,           // Buffer (recommended)
        contentType: "application/pdf",
      },
    ],
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  try {
    const payload = req.body as InvoicePayload;

    // 1) Build PDF
    const pdfBuffer = await buildPdf(payload);

    // 2) (Dev only) save a local copy to /private/invoices
    if (process.env.NODE_ENV !== "production") {
      const outDir = path.join(process.cwd(), "private", "invoices");
      fs.mkdirSync(outDir, { recursive: true });
      const outPath = path.join(outDir, `${payload.invoiceNumber}.pdf`);
      fs.writeFileSync(outPath, pdfBuffer);
    }

    // 3) Email if requested
    let emailed = false;
    if (payload.email) {
      await sendEmailWithPdf(payload, pdfBuffer);
      emailed = true;
    }

    return res.status(200).json({
      ok: true,
      route: "/api/invoices/create",
      emailed,
      saved: process.env.NODE_ENV !== "production",
    });
  } catch (err: any) {
    console.error("Invoice create failed:", err);
    return res.status(500).json({
      ok: false,
      error: "INVOICE_CREATE_FAILED",
      message: err?.message || "Unknown error",
    });
  }
}

