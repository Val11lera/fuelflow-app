// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import PDFDocument from "pdfkit";
import { sendInvoiceEmail } from "@/lib/mailer";

type Line = { description: string; qty: number; unitPrice: number };
type Payload = {
  company: { name: string; address?: string };
  customer: { name: string; email?: string; address?: string };
  lines: Line[];
  notes?: string;
  email?: boolean; // if true, email invoice to customer.email
};

function bad(res: NextApiResponse, msg: string) {
  res.status(400).json({ error: msg });
}

function money(n: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
  }).format(n);
}

async function makePdf(p: Payload): Promise<{ buffer: Buffer; filename: string }> {
  const filename = `INV-${new Date().toISOString().slice(0,10).replace(/-/g,"")}.pdf`;

  const doc = new PDFDocument({ margin: 50 });
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("error", reject);
    doc.on("end", () => resolve({ buffer: Buffer.concat(chunks), filename }));

    // Header
    doc.fontSize(20).text(p.company.name, { continued: false });
    if (p.company.address) doc.fontSize(10).text(p.company.address);
    doc.moveDown();

    // Bill To
    doc.fontSize(12).text("Bill To:", { underline: true });
    doc.text(p.customer.name);
    if (p.customer.address) doc.fontSize(10).text(p.customer.address);
    doc.moveDown();

    // Table header
    doc.fontSize(12).text("Description", 50, doc.y, { continued: true });
    doc.text("Qty", 350, doc.y, { continued: true });
    doc.text("Unit", 400, doc.y, { continued: true });
    doc.text("Line Total", 470, doc.y);
    doc.moveDown();

    let total = 0;
    for (const l of p.lines) {
      const lineTotal = l.qty * l.unitPrice;
      total += lineTotal;
      doc.text(l.description, 50, doc.y, { continued: true });
      doc.text(String(l.qty), 350, doc.y, { continued: true });
      doc.text(money(l.unitPrice), 400, doc.y, { continued: true });
      doc.text(money(lineTotal), 470, doc.y);
    }

    doc.moveDown();
    doc.fontSize(14).text(`TOTAL: ${money(total)}`, { align: "right" });

    if (p.notes) {
      doc.moveDown();
      doc.fontSize(10).text(p.notes);
    }

    doc.end();
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Accept JSON or already-parsed body
  const payload: Payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

  // ---- Minimal validation (this is what returned your earlier 400s)
  const missing: string[] = [];
  if (!payload?.company?.name) missing.push("company.name");
  if (!payload?.customer?.name) missing.push("customer.name");
  if (!Array.isArray(payload?.lines) || !payload.lines.length) missing.push("lines[]");
  for (const [i, l] of (payload.lines || []).entries()) {
    if (typeof l?.qty !== "number") missing.push(`lines[${i}].qty`);
    if (typeof l?.unitPrice !== "number") missing.push(`lines[${i}].unitPrice`);
    if (!l?.description) missing.push(`lines[${i}].description`);
  }
  if (missing.length) return bad(res, "Missing required fields: " + missing.join(", "));

  // ---- Create PDF
  const { buffer, filename } = await makePdf(payload);
  const base64 = buffer.toString("base64");

  // ---- Optionally email
  let emailed = false;
  let emailError: string | undefined;

  if (payload.email && payload.customer?.email) {
    const subject = `Invoice ${filename}`;
    const html = `<p>Hello ${payload.customer.name},</p>
                  <p>Please find your invoice attached.</p>
                  <p>Thanks,<br/>${payload.company.name}</p>`;
    const sent = await sendInvoiceEmail({
      to: payload.customer.email,
      subject,
      html,
      filename,
      pdfBase64: base64,
    });
    emailed = sent.ok;
    if (!sent.ok) emailError = sent.error;
  }

  // ---- Decide response format
  const wantsPdf =
    req.query.format === "pdf" ||
    (typeof req.headers.accept === "string" && req.headers.accept.includes("application/pdf"));

  if (wantsPdf) {
    // Return raw PDF bytes
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.status(200).send(buffer);
  } else {
    // Return JSON (safe for piping to jq)
    res.status(200).json({
      ok: true,
      filename,
      size: buffer.length,
      emailed,
      ...(emailError ? { emailError } : {}),
    });
  }
}
