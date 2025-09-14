// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import PDFDocument from "pdfkit";
import { sendInvoiceEmail } from "../../../lib/mailer"; // 3x .. from /pages/api/invoices

type Line = { description: string; qty: number; unitPrice: number };
type InvoicePayload = {
  company: { name: string; address?: string };
  customer: { name: string; email?: string; address?: string };
  lines: Line[];
  notes?: string;
  email?: boolean;   // if true, we'll email
  to?: string;       // optional override for recipient
};

function renderInvoice(doc: PDFDocument, p: InvoicePayload) {
  const total = p.lines.reduce((acc, l) => acc + l.qty * l.unitPrice, 0);

  doc.fontSize(22).text("INVOICE", { align: "right" }).moveDown();

  doc.fontSize(12).text(p.company.name);
  if (p.company.address) doc.text(p.company.address);
  doc.moveDown();

  doc.fontSize(12).text(`Bill To: ${p.customer.name}`);
  if (p.customer.address) doc.text(p.customer.address);
  doc.moveDown();

  doc.moveDown(0.5);
  doc.fontSize(12).text("Description", 50, doc.y, { continued: true });
  doc.text("Qty", 300, undefined, { continued: true });
  doc.text("Unit", 350, undefined, { continued: true });
  doc.text("Line", 420);

  doc.moveDown(0.5);
  p.lines.forEach((l) => {
    doc.text(l.description, 50, doc.y, { continued: true });
    doc.text(String(l.qty), 300, undefined, { continued: true });
    doc.text(l.unitPrice.toFixed(2), 350, undefined, { continued: true });
    doc.text((l.qty * l.unitPrice).toFixed(2), 420);
  });

  doc.moveDown();
  doc.text(`Total: ${total.toFixed(2)}`, { align: "right" });

  if (p.notes) {
    doc.moveDown();
    doc.text(p.notes);
  }
}

function makePdfBuffer(p: InvoicePayload): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (d) => chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(d)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    renderInvoice(doc, p);
    doc.end();
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(200).json({ ok: true, route: "/api/invoices/create" });
  }

  const p = req.body as InvoicePayload;

  // --- Basic validation
  if (
    !p?.company?.name ||
    !p?.customer?.name ||
    !Array.isArray(p?.lines) ||
    p.lines.length === 0
  ) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Build the PDF
  const pdfBuffer = await makePdfBuffer(p);
  const filename = `INV-${Date.now()}.pdf`;

  // If client asked for a PDF file (download stream)
  if (req.query.format === "pdf") {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    return res.status(200).send(pdfBuffer);
  }

  // Otherwise, JSON response; email if requested
  let emailed = false;
  let emailError: string | undefined;

  if (p.email) {
    const to = p.to ?? p.customer.email;
    const from = process.env.MAIL_FROM;
    if (!to || !from) {
      return res
        .status(400)
        .json({ error: "Missing email recipient or MAIL_FROM env var" });
    }

    const base64 = pdfBuffer.toString("base64");
    const subject = `${p.company.name} Invoice`;
    const html = `<p>Hi ${p.customer.name},</p><p>Attached is your invoice from ${p.company.name}.</p>`;

    const mail = await sendInvoiceEmail({
      to,
      from,
      subject,
      html,
      attachment: { filename, base64 },
    });

    emailed = mail.ok;
    if (!mail.ok) emailError = mail.error;
  }

  return res.status(200).json({
    ok: true,
    filename,
    emailed,
    ...(emailError ? { emailError } : {}),
  });
}

