// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";

// Optional email (enable later if wanted)
// import { Resend } from "resend";
// const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

type Party = {
  name: string;
  address?: string;
  email?: string;
};

type Line = {
  description: string;
  qty: number;
  unitPrice: number;
};

type InvoicePayload = {
  invoiceNumber: string;            // e.g. "INV-000123"
  issuedAt: string;                 // ISO string
  currency: string;                 // e.g. "GBP"
  company: Party;                   // your company
  customer: Party & { id?: string };// customer
  lines: Line[];
  notes?: string;
  email?: boolean;                  // true => (optionally) email later
};

const config = { api: { bodyParser: { sizeLimit: "1mb" } } };
export { config };

/** Helper: safe local folder in dev */
function ensureLocalFolder(dir: string) {
  if (process.env.VERCEL) return; // Vercel is read-only; skip
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** Draw a very simple invoice. Keep it readable. */
function renderInvoice(doc: InstanceType<typeof PDFDocument>, p: InvoicePayload) {
  const margin = 50;
  doc.fontSize(22).text("INVOICE", { align: "right" });
  doc.moveDown();

  // Header
  doc
    .fontSize(12)
    .text(`Invoice #: ${p.invoiceNumber}`)
    .text(`Issued: ${new Date(p.issuedAt).toLocaleString()}`)
    .text(`Currency: ${p.currency}`)
    .moveDown();

  // Parties
  doc
    .fontSize(12)
    .text(`${p.company.name}`, { continued: true })
    .text("", { align: "right" })
    .text(p.company.address || "")
    .moveDown();

  doc
    .text(`Bill To: ${p.customer.name}`)
    .text(p.customer.address || "")
    .moveDown();

  // Table header
  doc.moveDown().fontSize(12).text("Description", margin, doc.y, { width: 300 });
  doc.text("Qty", 350, doc.y - 15, { width: 50, align: "right" });
  doc.text("Unit", 410, doc.y - 30, { width: 80, align: "right" });
  doc.text("Total", 500, doc.y - 45, { width: 80, align: "right" });
  doc.moveDown();

  let grand = 0;
  p.lines.forEach((l) => {
    const total = l.qty * l.unitPrice;
    grand += total;
    doc.text(l.description, margin, doc.y, { width: 300 });
    doc.text(String(l.qty), 350, doc.y - 15, { width: 50, align: "right" });
    doc.text(l.unitPrice.toFixed(2), 410, doc.y - 30, { width: 80, align: "right" });
    doc.text(total.toFixed(2), 500, doc.y - 45, { width: 80, align: "right" });
    doc.moveDown();
  });

  doc.moveDown().fontSize(13).text(`Grand Total: ${grand.toFixed(2)} ${p.currency}`, { align: "right" });
  if (p.notes) {
    doc.moveDown().fontSize(10).text(p.notes);
  }
}

/** Create a pdf and stream it to:
 *   - the HTTP response (so curl can save it)
 *   - a local file in dev (private/invoices/INV-*.pdf)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, route: "/api/invoices/create" });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).end("Method Not Allowed");
  }

  // Parse/validate
  const p = req.body as InvoicePayload;
  if (!p || !p.invoiceNumber || !p.company?.name || !p.customer?.name || !p.lines?.length) {
    return res.status(400).json({ ok: false, error: "Missing required fields in payload." });
  }

  // Prepare paths
  const filename = `${p.invoiceNumber}.pdf`;
  const localDir = path.join(process.cwd(), "private", "invoices");
  const localPath = path.join(localDir, filename);

  // Create document
  const doc = new PDFDocument({ size: "A4", margin: 50 });

  // Response headers for PDF stream
  res.status(200);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);

  // Pipe to HTTP response
  doc.pipe(res);

  // Also save locally in dev (Vercel won't persist, but local dev will)
  if (!process.env.VERCEL) {
    ensureLocalFolder(localDir);
    const fileStream = fs.createWriteStream(localPath);
    doc.pipe(fileStream);
  }

  // Render the invoice
  renderInvoice(doc as InstanceType<typeof PDFDocument>, p);
  doc.end();

  // If you want to email the PDF later, use a Buffer. Example (disabled by default):
  // if (resend && p.email) {
  //   const chunks: Buffer[] = [];
  //   doc.on("data", (c) => chunks.push(c));
  //   doc.on("end", async () => {
  //     const pdfBuffer = Buffer.concat(chunks);
  //     await resend.emails.send({
  //       from: "FuelFlow <invoices@your-domain.com>",
  //       to: p.customer.email || "someone@example.com",
  //       subject: `Invoice ${p.invoiceNumber}`,
  //       text: "Thank you for your order. Your invoice is attached.",
  //       attachments: [{ filename, content: pdfBuffer }],
  //     });
  //   });
  // }
}
