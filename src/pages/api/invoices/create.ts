// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import PDFDocument from "pdfkit";
import { sendInvoiceEmail } from "@/lib/mailer";

type Line = { description: string; qty: number; unitPrice: number };
type InvoicePayload = {
  company: { name: string; address?: string };
  customer: { name: string; email: string; address?: string };
  lines: Line[];
  notes?: string;
  email?: boolean; // send email if true
  to?: string;     // optional override recipient(s), comma-separated
  bcc?: string;    // optional bcc, comma-separated
};

// Important: do NOT use "PDFDocument" as a *type*.
type PDFDoc = InstanceType<typeof PDFDocument>;

function renderInvoice(doc: PDFDoc, p: InvoicePayload) {
  doc.fontSize(22).text("INVOICE", { align: "right" }).moveDown();

  doc.fontSize(12).text(p.company.name);
  if (p.company.address) doc.text(p.company.address);
  doc.moveDown();

  doc.text(`Bill To: ${p.customer.name}`);
  if (p.customer.address) doc.text(p.customer.address);
  doc.moveDown();

  const total = p.lines.reduce((acc, l) => acc + l.qty * l.unitPrice, 0);

  doc.text("Items:").moveDown(0.5);
  p.lines.forEach((l) => {
    doc.text(`${l.description} — x${l.qty} @ £${l.unitPrice.toFixed(2)}`);
  });

  doc.moveDown().fontSize(14).text(`Total: £${total.toFixed(2)}`, { align: "right" });

  if (p.notes) {
    doc.moveDown().fontSize(10).text(p.notes);
  }

  doc.end();
}

function makePdfBase64(p: InvoicePayload): Promise<{ filename: string; base64: string }> {
  return new Promise((resolve, reject) => {
    const doc: PDFDoc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (buf: Buffer) => chunks.push(buf));
    doc.on("error", reject);
    doc.on("end", () => {
      const buffer = Buffer.concat(chunks);
      const base64 = buffer.toString("base64");
      const ts = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
      resolve({ filename: `INV-${ts}.pdf`, base64 });
    });

    renderInvoice(doc, p);
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(200).json({ ok: true, route: "/api/invoices/create" });
  }

  try {
    const p = req.body as InvoicePayload;

    if (
      !p?.company?.name ||
      !p?.customer?.name ||
      !p?.customer?.email ||
      !Array.isArray(p?.lines) ||
      p.lines.length === 0
    ) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const { filename, base64 } = await makePdfBase64(p);

    // Return a *real* PDF if requested
    if ((req.query.format as string) === "pdf") {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
      return res.status(200).send(Buffer.from(base64, "base64"));
    }

    // Otherwise return JSON, and email if requested
    let emailed = false;
    let emailId: string | null = null;

    if (p.email) {
      const to = p.to ?? p.customer.email;
      const from = process.env.MAIL_FROM;
      if (!from) return res.status(400).json({ error: "MAIL_FROM env var is missing" });

      const subject = `Invoice ${filename.replace(".pdf", "")}`;
      const html = `
        <p>Hello ${p.customer.name},</p>
        <p>Attached is your invoice <strong>${filename}</strong> from ${p.company.name}.</p>
        <p>Thank you!</p>
      `;

      const result = await sendInvoiceEmail({
        to,
        from,
        bcc: p.bcc ?? process.env.MAIL_BCC ?? "",
        subject,
        html,
        pdfFilename: filename,
        pdfBase64: base64,
      });

      // Proper union narrowing — avoids "Property 'error' does not exist…" TS error
      if ("error" in result) {
        return res.status(502).json({ error: "Email failed", detail: result.error });
      }

      emailed = true;
      emailId = result.id ?? null;
    }

    return res.status(200).json({ ok: true, filename, emailed, emailId });
  } catch (e: any) {
    return res.status(500).json({ error: "Server error", detail: String(e?.message ?? e) });
  }
}
