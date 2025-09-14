// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import PDFDocument from "pdfkit";
import { Resend } from "resend";

type Party = { name: string; address?: string; email?: string };
type Line  = { description: string; qty: number; unitPrice: number };
type InvoicePayload = {
  invoiceNumber: string;
  issuedAt: string;           // ISO date string
  currency: string;           // e.g. "GBP", "USD"
  company: Party;
  customer: Party & { id?: string };
  lines: Line[];
  notes?: string;
  email?: boolean;            // ignored; we always email
};

export const config = {
  api: { bodyParser: { sizeLimit: "1mb" } },
};

// --- helpers ---------------------------------------------------------------

function money(n: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
  }).format(n);
}

function renderInvoice(doc: PDFDocument, p: InvoicePayload) {
  const total = p.lines.reduce((acc, l) => acc + l.qty * l.unitPrice, 0);

  doc.fontSize(22).text("INVOICE", { align: "right" }).moveDown();

  doc.fontSize(12);
  doc.text(p.company.name);
  if (p.company.address) doc.text(p.company.address);
  doc.moveDown();

  doc.text(`Bill To: ${p.customer.name}`);
  if (p.customer.address) doc.text(p.customer.address);
  if (p.customer.email)   doc.text(p.customer.email);
  doc.moveDown();

  doc.text(`Invoice #: ${p.invoiceNumber}`);
  doc.text(`Date: ${new Date(p.issuedAt).toLocaleDateString()}`);
  doc.moveDown();

  doc.font("Helvetica-Bold");
  doc.text("Description", 50, doc.y);
  doc.text("Qty",         350, doc.y);
  doc.text("Unit",        400, doc.y);
  doc.text("Line Total",  470, doc.y);
  doc.moveDown(0.5);
  doc.font("Helvetica");
  doc.moveTo(50, doc.y).lineTo(560, doc.y).stroke();
  doc.moveDown(0.5);

  p.lines.forEach((l) => {
    const lineTotal = l.qty * l.unitPrice;
    doc.text(l.description, 50, doc.y);
    doc.text(String(l.qty), 350, doc.y);
    doc.text(money(l.unitPrice, p.currency), 400, doc.y);
    doc.text(money(lineTotal, p.currency), 470, doc.y);
    doc.moveDown(0.3);
  });

  doc.moveDown(0.8);
  doc.moveTo(50, doc.y).lineTo(560, doc.y).stroke();

  doc.font("Helvetica-Bold");
  doc.text(`Total: ${money(total, p.currency)}`, 400, doc.y + 8, { align: "right" });
  doc.font("Helvetica").moveDown(1.2);

  if (p.notes) {
    doc.fontSize(11).text("Notes", { underline: true }).moveDown(0.3);
    doc.fontSize(10).text(p.notes);
  }

  doc.moveDown(2);
  doc.fontSize(9).fillColor("#666").text("Thank you for your business.");
  doc.fillColor("black");
}

function pdfToBuffer(build: (doc: PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    build(doc);
    doc.end();
  });
}

// --- handler ---------------------------------------------------------------

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

    // minimal validation
    if (!p?.invoiceNumber || !p?.company?.name || !p?.customer?.name || !Array.isArray(p?.lines)) {
      return res.status(400).json({ ok: false, error: "Missing required fields." });
    }

    const filename = `${p.invoiceNumber}.pdf`;
    const pdfBuffer = await pdfToBuffer((doc) => renderInvoice(doc, p));

    const resend = new Resend(process.env.RESEND_API_KEY);
    const from = process.env.MAIL_FROM || "onboarding@resend.dev";
    const to = p.customer.email;                 // send to the customer
    const bcc = process.env.MAIL_BCC || "";      // your copy (optional)

    if (!to && !bcc) {
      return res.status(400).json({
        ok: false,
        error: "No recipient email. Provide customer.email or set MAIL_BCC.",
      });
    }

    const subject = `Invoice ${p.invoiceNumber}`;
    const text = [
      `Invoice: ${p.invoiceNumber}`,
      `Date:    ${new Date(p.issuedAt).toLocaleDateString()}`,
      "",
      `Customer: ${p.customer.name}`,
      p.notes ? `Notes: ${p.notes}` : "",
      "",
      "The PDF invoice is attached.",
    ].join("\n");

    const resp = await resend.emails.send({
      from,
      to: to || bcc,            // if customer email missing, send to BCC as main recipient
      ...(to && bcc ? { bcc } : {}),
      subject,
      text,
      attachments: [{ filename, content: pdfBuffer }],
    });

    if (resp.error) {
      return res.status(502).json({ ok: false, error: resp.error.message });
    }

    return res.status(200).json({
      ok: true,
      emailed: true,
      to: to || null,
      bcc: to && bcc ? bcc : null,
      messageId: resp.data?.id || null,
      file: filename,
    });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e?.message || "Server error" });
  }
}

