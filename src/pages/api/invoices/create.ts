// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import PDFDocument from "pdfkit";
import { createClient } from "@supabase/supabase-js";

/** Always run on Node.js runtime (needed for pdfkit, nodemailer, etc.) */
export const runtime = "nodejs";

/** Optional nodemailer loader (safe if package not installed) */
function getNodemailer() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("nodemailer");
  } catch {
    return null;
  }
}

type InvoiceLine = {
  description: string;
  qty: number;
  unitPrice: number; // in currency units (e.g., 10.5 == £10.50)
};

type InvoicePayload = {
  invoiceNumber: string;
  issuedAt: string;     // ISO date
  dueAt?: string;       // ISO date
  currency?: string;    // e.g. "GBP"
  company?: { name?: string; address?: string; };
  customer: { id: string; name: string; email: string; address?: string; };
  lines: InvoiceLine[];
  notes?: string;
  email?: boolean;      // send email with attachment
};

function money(n: number, currency = "GBP") {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(n);
}

/** Build the PDF and return it as a Buffer */
async function buildInvoicePdf(payload: InvoicePayload): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const chunks: Uint8Array[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) =>
    doc.on("end", () => resolve(Buffer.concat(chunks as any)))
  );

  const currency = payload.currency || "GBP";
  const companyName = payload.company?.name || "FuelFlow";
  const companyAddr = payload.company?.address || "Company Address Line\nCity, Postcode\nUnited Kingdom";

  // Header
  doc.fontSize(20).text(companyName, { continued: false });
  doc.fontSize(10).fillColor("#666").text(companyAddr);
  doc.moveDown();

  // Invoice block
  doc.fillColor("#000").fontSize(18).text("INVOICE");
  doc.moveDown(0.5);
  doc.fontSize(11)
    .text(`Invoice #: ${payload.invoiceNumber}`)
    .text(`Issue Date: ${new Date(payload.issuedAt).toLocaleDateString("en-GB")}`)
    .text(`Due Date: ${payload.dueAt ? new Date(payload.dueAt).toLocaleDateString("en-GB") : "-"}`);
  doc.moveDown();

  // Bill to
  doc.fontSize(12).text("Bill To:", { underline: true });
  doc.fontSize(11)
    .text(payload.customer.name)
    .text(payload.customer.address || "")
    .text(payload.customer.email);
  doc.moveDown();

  // Table header
  doc.fontSize(12).text("Description", 50, doc.y, { continued: true, width: 300 });
  doc.text("Qty", 360, doc.y, { width: 50, align: "right", continued: true });
  doc.text("Unit", 415, doc.y, { width: 70, align: "right", continued: true });
  doc.text("Amount", 490, doc.y, { width: 70, align: "right" });
  doc.moveTo(50, doc.y + 5).lineTo(560, doc.y + 5).stroke();
  doc.moveDown(0.5);

  // Lines
  const subtotal = payload.lines.reduce((acc, l) => acc + l.qty * l.unitPrice, 0);
  payload.lines.forEach((l) => {
    doc.fontSize(11)
      .text(l.description, 50, doc.y, { width: 300, continued: true })
      .text(l.qty.toString(), 360, doc.y, { width: 50, align: "right", continued: true })
      .text(money(l.unitPrice, currency), 415, doc.y, { width: 70, align: "right", continued: true })
      .text(money(l.qty * l.unitPrice, currency), 490, doc.y, { width: 70, align: "right" });
    doc.moveDown(0.2);
  });

  doc.moveDown(1);
  doc.moveTo(50, doc.y).lineTo(560, doc.y).stroke();

  // Totals (no VAT here; add your calc if needed)
  doc.fontSize(12).text("Subtotal:", 420, doc.y + 10, { width: 70, align: "right", continued: true });
  doc.text(money(subtotal, currency), 490, doc.y, { width: 70, align: "right" });

  // Notes
  if (payload.notes) {
    doc.moveDown(2);
    doc.fontSize(11).text("Notes:", { underline: true });
    doc.fontSize(10).fillColor("#444").text(payload.notes);
  }

  // Footer
  doc.moveDown(3);
  doc.fontSize(9).fillColor("#888")
    .text("Thank you for your business.", { align: "center" });

  doc.end();
  return done;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const payload = req.body as InvoicePayload;
  if (!payload?.invoiceNumber || !payload?.customer?.id || !payload?.customer?.email || !payload.lines?.length) {
    return res.status(400).json({ error: "Missing required invoice fields" });
  }

  try {
    // 1) Build PDF
    const pdfBuffer = await buildInvoicePdf(payload);

    // 2) Upload to Supabase Storage (bucket "invoices")
    const supa = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const path = `${payload.customer.id}/${payload.invoiceNumber}.pdf`;
    const { error: upErr } = await supa.storage
      .from("invoices")
      .upload(path, pdfBuffer, { contentType: "application/pdf", upsert: true });

    if (upErr) {
      return res.status(500).json({ error: "Failed to upload invoice", detail: upErr.message });
    }

    // Get a public or signed URL (choose your policy)
    const { data: pub } = supa.storage.from("invoices").getPublicUrl(path);
    const publicUrl = pub?.publicUrl;

    // 3) Optional: email to customer as PDF attachment
    if (payload.email) {
      const nodemailer = getNodemailer();
      const hasSMTP =
        process.env.SMTP_HOST &&
        process.env.SMTP_USER &&
        process.env.SMTP_PASS &&
        (process.env.SMTP_PORT || "587");

      if (nodemailer && hasSMTP) {
        try {
          const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST!,
            port: Number(process.env.SMTP_PORT || 587),
            secure: Number(process.env.SMTP_PORT || 587) === 465,
            auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
          });

          const from = process.env.EMAIL_FROM || "FuelFlow <no-reply@fuelflow.co.uk>";
          const replyTo = process.env.EMAIL_REPLY_TO || "support@fuelflow.co.uk";

          await transporter.sendMail({
            from,
            to: payload.customer.email,
            replyTo,
            subject: `Invoice ${payload.invoiceNumber}`,
            text: `Hi ${payload.customer.name},\n\nPlease find your invoice attached.\n\nInvoice: ${payload.invoiceNumber}\nURL: ${publicUrl || "N/A"}\n`,
            html: `Hi ${payload.customer.name},<br/><br/>Please find your invoice attached.<br/><br/>Invoice: <b>${payload.invoiceNumber}</b><br/>URL: ${publicUrl ? `<a href="${publicUrl}">Download</a>` : "N/A"}`,
            attachments: [
              { filename: `${payload.invoiceNumber}.pdf`, content: pdfBuffer }
            ],
          });
        } catch (e: any) {
          // Don't fail the whole request just because email failed
          return res.status(200).json({
            ok: true,
            emailed: false,
            publicUrl,
            warning: `Invoice created but email failed: ${e?.message || e}`,
          });
        }
      }
    }

    // 4) return info
    return res.status(200).json({
      ok: true,
      invoiceNumber: payload.invoiceNumber,
      publicUrl,
      storagePath: path,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Invoice generation failed" });
  }
}
