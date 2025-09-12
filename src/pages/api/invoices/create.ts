// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import PDFDocument from "pdfkit";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs"; // ensure Node runtime (needed for pdfkit/nodemailer)

// OPTIONAL: bump the JSON body limit a bit
export const config = {
  api: { bodyParser: { sizeLimit: "2mb" } },
};

function getNodemailer() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("nodemailer");
  } catch {
    return null;
  }
}

type InvoiceLine = { description: string; qty: number; unitPrice: number };
type InvoicePayload = {
  invoiceNumber: string;
  issuedAt: string;
  dueAt?: string;
  currency?: string;
  company?: { name?: string; address?: string };
  customer: { id: string; name: string; email: string; address?: string };
  lines: InvoiceLine[];
  notes?: string;
  email?: boolean;
};

function money(n: number, currency = "GBP") {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(n);
}

async function buildInvoicePdf(payload: InvoicePayload): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const chunks: Uint8Array[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) =>
    doc.on("end", () => resolve(Buffer.concat(chunks as any)))
  );

  const currency = payload.currency || "GBP";
  const companyName = payload.company?.name || "FuelFlow";
  const companyAddr =
    payload.company?.address || "Company Address Line\nCity, Postcode\nUnited Kingdom";

  // Header
  doc.fontSize(20).text(companyName);
  doc.fontSize(10).fillColor("#666").text(companyAddr);
  doc.moveDown();

  // Invoice block
  doc.fillColor("#000").fontSize(18).text("INVOICE");
  doc.moveDown(0.5);
  doc
    .fontSize(11)
    .text(`Invoice #: ${payload.invoiceNumber}`)
    .text(`Issue Date: ${new Date(payload.issuedAt).toLocaleDateString("en-GB")}`)
    .text(`Due Date: ${payload.dueAt ? new Date(payload.dueAt).toLocaleDateString("en-GB") : "-"}`);
  doc.moveDown();

  // Bill to
  doc.fontSize(12).text("Bill To:", { underline: true });
  doc
    .fontSize(11)
    .text(payload.customer.name)
    .text(payload.customer.address || "")
    .text(payload.customer.email);
  doc.moveDown();

  // Table header
  doc.fontSize(12).text("Description", 50, doc.y, { width: 300, continued: true });
  doc.text("Qty", 360, doc.y, { width: 50, align: "right", continued: true });
  doc.text("Unit", 415, doc.y, { width: 70, align: "right", continued: true });
  doc.text("Amount", 490, doc.y, { width: 70, align: "right" });
  doc.moveTo(50, doc.y + 5).lineTo(560, doc.y + 5).stroke();
  doc.moveDown(0.5);

  // Lines
  const subtotal = payload.lines.reduce((acc, l) => acc + l.qty * l.unitPrice, 0);
  payload.lines.forEach((l) => {
    doc
      .fontSize(11)
      .text(l.description, 50, doc.y, { width: 300, continued: true })
      .text(String(l.qty), 360, doc.y, { width: 50, align: "right", continued: true })
      .text(money(l.unitPrice, currency), 415, doc.y, { width: 70, align: "right", continued: true })
      .text(money(l.qty * l.unitPrice, currency), 490, doc.y, { width: 70, align: "right" });
    doc.moveDown(0.2);
  });

  doc.moveDown(1);
  doc.moveTo(50, doc.y).lineTo(560, doc.y).stroke();

  // Totals
  doc.fontSize(12).text("Subtotal:", 420, doc.y + 10, { width: 70, align: "right", continued: true });
  doc.text(money(subtotal, currency), 490, doc.y, { width: 70, align: "right" });

  if (payload.notes) {
    doc.moveDown(2);
    doc.fontSize(11).text("Notes:", { underline: true });
    doc.fontSize(10).fillColor("#444").text(payload.notes);
  }

  doc.moveDown(3);
  doc.fontSize(9).fillColor("#888").text("Thank you for your business.", { align: "center" });

  doc.end();
  return done;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const payload = req.body as InvoicePayload;

  // Basic validation
  if (!payload?.invoiceNumber || !payload?.issuedAt || !payload?.customer?.id || !payload?.customer?.email || !payload.lines?.length) {
    return res.status(400).json({ error: "MISSING_FIELDS" });
  }

  try {
    const pdfBuffer = await buildInvoicePdf(payload);

    // Quick preview path so you can confirm PDF generation even if Supabase/envs are not ready
    if (req.query.preview === "1") {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${payload.invoiceNumber}.pdf"`
      );
      return res.status(200).send(pdfBuffer);
    }

    const missingEnvs: string[] = [];
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missingEnvs.push("NEXT_PUBLIC_SUPABASE_URL");
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missingEnvs.push("SUPABASE_SERVICE_ROLE_KEY");

    if (missingEnvs.length) {
      console.warn("Missing envs:", missingEnvs.join(", "));
      return res.status(500).json({
        error: "MISSING_ENVS",
        detail: missingEnvs,
        hint: "Set these in .env.local and restart dev server",
      });
    }

    // Upload to Supabase Storage
    const supa = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const storagePath = `${payload.customer.id}/${payload.invoiceNumber}.pdf`;

    const { error: upErr } = await supa.storage
      .from("invoices")
      .upload(storagePath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (upErr) {
      console.error("UPLOAD_FAILED", upErr);
      return res.status(500).json({ error: "UPLOAD_FAILED", detail: upErr.message });
    }

    const { data: pub } = supa.storage.from("invoices").getPublicUrl(storagePath);
    const publicUrl = pub?.publicUrl;

    // Optional email
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
            text: `Hi ${payload.customer.name},\n\nPlease find your invoice attached.\nURL: ${publicUrl || "N/A"}`,
            html: `Hi ${payload.customer.name},<br/><br/>Please find your invoice attached.<br/>URL: ${
              publicUrl ? `<a href="${publicUrl}">Download</a>` : "N/A"
            }`,
            attachments: [{ filename: `${payload.invoiceNumber}.pdf`, content: pdfBuffer }],
          });
        } catch (e: any) {
          console.error("EMAIL_FAILED", e);
          return res.status(200).json({
            ok: true,
            emailed: false,
            storagePath,
            publicUrl,
            warning: `Invoice created but email failed: ${e?.message || e}`,
          });
        }
      }
    }

    return res.status(200).json({ ok: true, invoiceNumber: payload.invoiceNumber, storagePath, publicUrl });
  } catch (e: any) {
    console.error("INVOICE_API_ERROR", e);
    return res.status(500).json({ error: "INTERNAL_ERROR", detail: e?.message || String(e) });
  }
}
