// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { Resend } from "resend";
import PDFDocument from "pdfkit";

/** -------- Types (simple, no PDFKit types to avoid Vercel errors) -------- */
type Line = { description: string; qty: number; unitPrice: number };
type Party = { name: string; address?: string; email?: string; id?: string };
type InvoicePayload = {
  invoiceNumber: string;
  issuedAt: string; // ISO
  currency: string; // e.g. "GBP"
  company: Party;
  customer: Party & { email: string };
  lines: Line[];
  notes?: string;
  email?: boolean; // if true, we email the PDF
};

/** -------- Render a minimal invoice into a PDFKit doc -------- */
function renderInvoice(doc: any, p: InvoicePayload) {
  const money = (n: number) =>
    new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: p.currency || "GBP",
    }).format(n);

  doc.fontSize(20).text("INVOICE", { align: "right" }).moveDown(1);

  doc
    .fontSize(12)
    .text(p.company.name)
    .text(p.company.address || "")
    .moveDown(1);

  doc
    .fontSize(12)
    .text(`Bill To: ${p.customer.name}`)
    .text(p.customer.address || "")
    .text(p.customer.email || "")
    .moveDown(1);

  doc
    .fontSize(12)
    .text(`Invoice #: ${p.invoiceNumber}`)
    .text(`Issued: ${new Date(p.issuedAt).toLocaleDateString()}`)
    .moveDown(1);

  doc.fontSize(12).text("Description", 50, doc.y, { continued: true });
  doc.text("Qty", 300, doc.y, { continued: true });
  doc.text("Unit", 350, doc.y, { continued: true });
  doc.text("Amount", 430);
  doc.moveDown(0.5);

  let total = 0;
  p.lines.forEach((l) => {
    const amount = l.qty * l.unitPrice;
    total += amount;
    doc.text(l.description, 50, doc.y, { continued: true });
    doc.text(String(l.qty), 300, doc.y, { continued: true });
    doc.text(money(l.unitPrice), 350, doc.y, { continued: true });
    doc.text(money(amount), 430);
  });

  doc.moveDown(0.5);
  doc.text("".padEnd(60, "—"));
  doc.fontSize(13).text(`Total: ${money(total)}`, { align: "right" });

  if (p.notes) {
    doc.moveDown(1);
    doc.fontSize(11).text(p.notes);
  }
}

/** -------- Build the PDF into a Buffer -------- */
async function buildPdfBuffer(p: InvoicePayload): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new (PDFDocument as any)({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: any) =>
      chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c))
    );
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    renderInvoice(doc, p);
    doc.end();
  });
}

/** -------- Email via Resend -------- */
async function sendInvoiceEmail(
  pdf: Buffer,
  p: InvoicePayload
): Promise<{ id?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;

  if (!apiKey) throw new Error("Missing RESEND_API_KEY");
  if (!from) throw new Error("Missing MAIL_FROM");

  const resend = new Resend(apiKey);

  const filename = `${p.invoiceNumber}.pdf`;
  const bcc = process.env.MAIL_BCC;

  const result = await resend.emails.send({
    from,
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
        content: pdf.toString("base64"),
        contentType: "application/pdf",
      },
    ],
  });

  return { id: (result as any)?.data?.id };
}

/** -------- Handler -------- */
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

    // minimal validation
    if (!payload?.invoiceNumber) {
      return res.status(400).json({ ok: false, error: "Missing invoiceNumber" });
    }
    if (!payload?.customer?.email) {
      return res.status(400).json({ ok: false, error: "Missing customer.email" });
    }
    if (!Array.isArray(payload?.lines) || payload.lines.length === 0) {
      return res.status(400).json({ ok: false, error: "No invoice lines" });
    }

    const pdfBuffer = await buildPdfBuffer(payload);

    let emailId: string | undefined;
    if (payload.email) {
      const mail = await sendInvoiceEmail(pdfBuffer, payload);
      emailId = mail.id;
    }

    // respond once, then stop (prevents dev warning)
    return res.status(200).json({
      ok: true,
      emailed: Boolean(payload.email),
      emailId: emailId || null,
      bytes: pdfBuffer.length,
    });
  } catch (err: any) {
    console.error("Create invoice failed:", err);
    return res.status(500).json({ ok: false, error: err?.message || "Error" });
  }
}
