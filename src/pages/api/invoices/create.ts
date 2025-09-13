// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";

export const config = {
  api: {
    bodyParser: { sizeLimit: "1mb" },
  },
};

type Party = { name: string; address: string; email?: string };
type Line = { description: string; qty: number; unitPrice: number };

type InvoicePayload = {
  invoiceNumber: string;
  issuedAt: string; // ISO string
  currency: string; // e.g. "GBP"
  company: Party;
  customer: Party & { id?: string };
  lines: Line[];
  notes?: string;
  email?: boolean;
};

function formatMoney(v: number, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(v);
}

async function writePdf(payload: InvoicePayload, outPath: string) {
  // ensure directory exists
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const out = fs.createWriteStream(outPath);
  doc.pipe(out);

  // Header
  doc.fontSize(22).text("INVOICE", { align: "right" }).moveDown(0.5);
  doc.fontSize(11);
  doc.text(`Invoice #: ${payload.invoiceNumber}`, { align: "right" });
  doc.text(`Issued: ${new Date(payload.issuedAt).toLocaleString()}`, { align: "right" });
  doc.moveDown();

  // Parties
  doc.fontSize(12).text(payload.company.name).text(payload.company.address).moveDown();
  doc.text("Bill To:").moveDown(0.2);
  doc.text(payload.customer.name).text(payload.customer.address);
  if (payload.customer.email) doc.text(payload.customer.email);
  doc.moveDown();

  // Table header
  const startX = 50;
  let y = doc.y + 10;
  doc.font("Helvetica-Bold");
  doc.text("Description", startX, y);
  doc.text("Qty", 350, y, { width: 40, align: "right" });
  doc.text("Unit", 400, y, { width: 70, align: "right" });
  doc.text("Line Total", 480, y, { width: 90, align: "right" });
  doc.font("Helvetica");
  y += 18;
  doc.moveTo(startX, y).lineTo(560, y).stroke();
  y += 8;

  // Lines
  let subtotal = 0;
  payload.lines.forEach((l) => {
    const lineTotal = l.qty * l.unitPrice;
    subtotal += lineTotal;
    doc.text(l.description, startX, y, { width: 280 });
    doc.text(String(l.qty), 350, y, { width: 40, align: "right" });
    doc.text(formatMoney(l.unitPrice, payload.currency), 400, y, { width: 70, align: "right" });
    doc.text(formatMoney(lineTotal, payload.currency), 480, y, { width: 90, align: "right" });
    y += 18;
  });

  // Totals
  y += 6;
  doc.moveTo(400, y).lineTo(560, y).stroke();
  y += 8;
  doc.font("Helvetica-Bold")
    .text("Subtotal", 400, y, { width: 70, align: "right" })
    .text(formatMoney(subtotal, payload.currency), 480, y, { width: 90, align: "right" });
  doc.font("Helvetica");
  y += 22;

  // Notes
  if (payload.notes) {
    doc.moveDown().font("Helvetica-Oblique").text(`Notes: ${payload.notes}`);
  }

  doc.end();

  // Wait until the stream is finished to guarantee the file exists
  await new Promise<void>((resolve, reject) => {
    out.on("finish", resolve);
    out.on("error", reject);
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, route: "/api/invoices/create" });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).end("Method Not Allowed");
  }

  const payload = req.body as InvoicePayload;
  if (!payload?.invoiceNumber || !payload?.lines?.length || !payload?.company || !payload?.customer) {
    return res.status(400).json({ ok: false, error: "Missing required invoice fields" });
  }

  const outPath = path.join(process.cwd(), "private", "invoices", `${payload.invoiceNumber}.pdf`);

  try {
    await writePdf(payload, outPath);
    return res.status(201).json({
      ok: true,
      savedAs: `/private/invoices/${payload.invoiceNumber}.pdf`,
      absPath: outPath,
    });
  } catch (err: any) {
    console.error("PDF write failed:", err);
    return res.status(500).json({ ok: false, error: "Failed to generate PDF" });
  }
}
