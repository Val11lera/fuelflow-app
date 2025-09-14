// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import nodemailer from "nodemailer";

// 👇 pdfkit's types can be awkward in serverless/Vercel. This prevents TS build errors.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import PDFDocument from "pdfkit";

// ---------- Types ----------
type Party = { name: string; address?: string; email?: string };
type Line  = { description: string; qty: number; unitPrice: number };

type InvoicePayload = {
  invoiceNumber: string;
  issuedAt: string;   // ISO string
  currency: string;   // "GBP", "USD", etc
  company: Party;
  customer: Party & { id?: string };
  lines: Line[];
  notes?: string;
  email?: boolean;    // if true, send the email
};

// Allow larger JSON bodies
export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };

// ---------- Helpers ----------
function renderInvoice(doc: any, p: InvoicePayload) {
  // Header
  doc.fontSize(22).text("INVOICE", { align: "right" }).moveDown();

  doc.fontSize(12).text(p.company.name);
  if (p.company.address) doc.text(p.company.address);
  doc.moveDown();

  doc.text(`Invoice: ${p.invoiceNumber}`);
  doc.text(`Date: ${new Date(p.issuedAt).toLocaleDateString()}`);
  doc.text(`Bill To: ${p.customer.name}`);
  if (p.customer.address) doc.text(p.customer.address);
  doc.moveDown();

  // Lines
  doc.text("Description                               Qty       Price       Amount");
  doc.moveDown(0.3);

  let total = 0;
  p.lines.forEach((l) => {
    const amount = l.qty * l.unitPrice;
    total += amount;
    doc.text(
      `${l.description.padEnd(40).slice(0, 40)}  ${String(l.qty).padStart(3)}   ${l.unitPrice.toFixed(2).padStart(8)}   ${amount.toFixed(2).padStart(10)}`
    );
  });

  doc.moveDown();
  doc.text(`Total (${p.currency}): ${total.toFixed(2)}`, { align: "right" });

  if (p.notes) {
    doc.moveDown().text("Notes:").text(p.notes);
  }
}

// turn a PDFDocument stream into a Buffer
function pdfToBuffer(doc: any): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (d: Buffer | string) =>
      chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(d))
    );
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

// ---------- Handler ----------
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, route: "/api/invoices/create" });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).end("Method Not Allowed");
  }

  try {
    const p: InvoicePayload = req.body;

    // Basic checks
    if (!p?.company?.name || !p?.customer?.email || !p.invoiceNumber || !p.lines?.length) {
      return res.status(400).json({ ok: false, error: "Invalid payload" });
    }

    // Create PDF in memory
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    renderInvoice(doc, p);
    doc.end();
    const pdfBuffer = await pdfToBuffer(doc);

    // If email flag is false, just return the pdf bytes (base64) to confirm it worked
    if (!p.email) {
      return res.status(200).json({
        ok: true,
        emailed: false,
        previewBase64: pdfBuffer.toString("base64").slice(0, 60) + "...",
      });
    }

    // SMTP transport (Gmail) — values from env
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: process.env.SMTP_SECURE === "true", // true for 465, false for 587
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const from = process.env.MAIL_FROM || process.env.SMTP_USER;

    await transporter.sendMail({
      from,
      to: p.customer.email,
      subject: `Invoice ${p.invoiceNumber}`,
      text: `Hello ${p.customer.name},\n\nPlease find your invoice attached.\n\nRegards,\n${p.company.name}`,
      attachments: [
        {
          filename: `${p.invoiceNumber}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    return res.status(200).json({ ok: true, emailed: true });
  } catch (err: any) {
    console.error("create.ts error:", err);
    return res.status(500).json({ ok: false, error: err?.message || "Server error" });
  }
}
