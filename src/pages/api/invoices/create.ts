// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import PDFDocument from "pdfkit";
import { sendMail } from "@/lib/mailer"; // or use a relative import: "../../../lib/mailer"

type LineItem = {
  description: string;
  quantity: number;
  unitPrice: number; // in major units (e.g. 1.75 = £1.75)
};

type InvoicePayload = {
  customer: {
    name?: string | null;
    email: string;
    address_line1?: string | null;
    address_line2?: string | null;
    city?: string | null;
    postcode?: string | null;
  };
  items: LineItem[];
  currency: string; // "GBP" | "USD" | etc
  meta?: {
    invoiceNumber?: string;
    orderId?: string;
    notes?: string;
  };
};

export const config = {
  api: { bodyParser: true },
};

function bad(res: NextApiResponse, code: number, msg: string) {
  return res.status(code).json({ ok: false, error: msg });
}

function currencySymbol(cur: string) {
  const c = (cur || "").toUpperCase();
  if (c === "GBP") return "£";
  if (c === "EUR") return "€";
  if (c === "USD") return "$";
  return "";
}

async function buildPdf(payload: InvoicePayload): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 50 });

  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<void>((resolve) => doc.on("end", () => resolve()));

  const companyName = process.env.COMPANY_NAME || "FuelFlow";
  const companyAddr =
    process.env.COMPANY_ADDRESS ||
    "1 Example Street\nExample Town\nEX1 2MP\nUnited Kingdom";

  const cur = (payload.currency || "GBP").toUpperCase();
  const sym = currencySymbol(cur);
  const invNo =
    payload.meta?.invoiceNumber ||
    `INV-${Math.floor(Date.now() / 1000)}`; // simple default

  // Header
  doc.fontSize(20).text(companyName, { continued: false });
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor("#555").text(companyAddr);
  doc.moveDown(1);

  // Invoice meta
  doc.fillColor("black").fontSize(14).text(`Invoice ${invNo}`);
  doc.fontSize(10).text(`Date: ${new Date().toLocaleDateString("en-GB")}`);
  if (payload.meta?.orderId) doc.text(`Order: ${payload.meta.orderId}`);
  doc.moveDown(1);

  // Bill To
  doc.fontSize(12).text("Bill To:");
  doc.fontSize(10);
  const name = payload.customer.name || "Customer";
  doc.text(name);
  if (payload.customer.address_line1)
    doc.text(String(payload.customer.address_line1));
  if (payload.customer.address_line2)
    doc.text(String(payload.customer.address_line2));
  if (payload.customer.city || payload.customer.postcode)
    doc.text(
      [payload.customer.city, payload.customer.postcode].filter(Boolean).join(" ")
    );

  doc.moveDown(1);

  // Table header
  const left = 50;
  const right = 545;
  const col1 = left;
  const col2 = 350;
  const col3 = 430;
  const col4 = 500;

  doc.fontSize(11).text("Description", col1, doc.y, { continued: true });
  doc.text("Qty", col2, doc.y, { width: 60, align: "right", continued: true });
  doc.text(
    "Unit",
    col3,
    doc.y,
    { width: 60, align: "right", continued: true }
  );
  doc.text("Line", col4, doc.y, { width: right - col4, align: "right" });

  doc.moveTo(left, doc.y + 4).lineTo(right, doc.y + 4).stroke();
  doc.moveDown(0.6);

  // Lines
  let subtotal = 0;
  payload.items.forEach((it) => {
    const qty = Number(it.quantity || 0);
    const unit = Number(it.unitPrice || 0);
    const line = qty * unit;
    subtotal += line;

    doc.fontSize(10).text(it.description, col1, doc.y, { continued: true });
    doc.text(String(qty), col2, doc.y, {
      width: 60,
      align: "right",
      continued: true,
    });
    doc.text(`${sym}${unit.toFixed(2)}`, col3, doc.y, {
      width: 60,
      align: "right",
      continued: true,
    });
    doc.text(`${sym}${line.toFixed(2)}`, col4, doc.y, {
      width: right - col4,
      align: "right",
    });
    doc.moveDown(0.3);
  });

  doc.moveDown(0.8);
  doc.moveTo(left, doc.y).lineTo(right, doc.y).stroke();
  doc.moveDown(0.6);

  // Totals (no VAT calc here—add if you need it)
  doc.fontSize(11).text("Subtotal:", col3, doc.y, {
    width: 60,
    align: "right",
    continued: true,
  });
  doc.text(`${sym}${subtotal.toFixed(2)}`, col4, doc.y, {
    width: right - col4,
    align: "right",
  });

  const total = subtotal;
  doc.fontSize(12).text("Total:", col3, doc.y + 6, {
    width: 60,
    align: "right",
    continued: true,
  });
  doc.text(`${sym}${total.toFixed(2)}`, col4, doc.y + 6, {
    width: right - col4,
    align: "right",
  });

  if (payload.meta?.notes) {
    doc.moveDown(1.2);
    doc.fontSize(10).fillColor("#555").text(payload.meta.notes);
    doc.fillColor("black");
  }

  doc.end();
  await done;
  return Buffer.concat(chunks);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return bad(res, 405, "Method Not Allowed");

  // Secret check
  const secret = req.headers["x-invoice-secret"];
  if (!process.env.INVOICE_SECRET) return bad(res, 500, "INVOICE_SECRET not set");
  if (!secret || secret !== process.env.INVOICE_SECRET) {
    return bad(res, 401, "Invalid invoice secret");
  }

  const payload = req.body as InvoicePayload;
  if (!payload?.customer?.email) return bad(res, 400, "Missing customer.email");
  if (!Array.isArray(payload.items) || payload.items.length === 0)
    return bad(res, 400, "Missing items");
  const cur = (payload.currency || "GBP").toUpperCase();

  try {
    // Build the invoice PDF
    const pdf = await buildPdf(payload);
    const invNo =
      payload.meta?.invoiceNumber ||
      `INV-${Math.floor(Date.now() / 1000)}`;

    // Send it
    const to = payload.customer.email;
    const bcc = process.env.MAIL_BCC || undefined;

    const id = await sendMail({
      to,
      bcc,
      subject: `${process.env.COMPANY_NAME || "FuelFlow"} — Invoice ${invNo}`,
      text: `Hi ${
        payload.customer.name || "there"
      },\n\nThanks for your order. Your invoice ${invNo} is attached.\n\nKind regards,\n${
        process.env.COMPANY_NAME || "FuelFlow"
      }`,
      attachments: [
        {
          filename: `${invNo}.pdf`,
          content: pdf,
          contentType: "application/pdf",
        },
      ],
    });

    return res.status(200).json({ ok: true, id });
  } catch (e: any) {
    console.error("invoice/create error", e);
    return bad(res, 500, e?.message || "invoice_error");
  }
}
