// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "node:crypto";
import { sendMail } from "@/lib/mailer";
import { buildInvoicePdf } from "@/lib/invoice-pdf"; // shared generator

// Caller may send different shapes; we accommodate all without breaking your current clients.
type LineItemIn = {
  description: string;

  // Quantities that may appear
  litres?: number;           // common in your system
  quantity?: number;         // alias for litres

  // Pricing that may appear
  unitPrice?: number;        // price per litre (major units)
  unit_price_pence?: number; // price per litre (minor units)
  total?: number;            // line total (major units)
  total_pence?: number;      // line total (minor units)
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
  items: LineItemIn[];
  currency: string;
  meta?: { invoiceNumber?: string; orderId?: string; notes?: string; };
};

export const config = { api: { bodyParser: true } };

function bad(res: NextApiResponse, code: number, msg: string) {
  return res.status(code).json({ ok: false, error: msg });
}
function safeEqual(a: string, b: string) {
  const A = Buffer.from(a, "utf8");
  const B = Buffer.from(b, "utf8");
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return bad(res, 405, "Method Not Allowed");

  const expected = process.env.INVOICE_SECRET;
  if (!expected) return bad(res, 500, "INVOICE_SECRET not set");
  const provided = String(req.headers["x-invoice-secret"] || "");
  if (!provided || !safeEqual(provided, expected)) return bad(res, 401, "Invalid invoice secret");

  const payload = req.body as InvoicePayload;
  if (!payload?.customer?.email) return bad(res, 400, "Missing customer.email");
  if (!Array.isArray(payload.items) || payload.items.length === 0) return bad(res, 400, "Missing items");
  if (!payload.currency) return bad(res, 400, "Missing currency");

  try {
    const normItems = payload.items.map((raw) => {
      // 1) quantity in litres
      const qty =
        Number(raw.quantity ?? raw.litres ?? 0);

      // 2) per-litre price (major units), from any of the forms we might get
      let unit = Number(raw.unitPrice ?? 0);
      if (!unit && raw.unit_price_pence != null) unit = Number(raw.unit_price_pence) / 100;

      // 3) if caller actually sent a *line total* instead of unit price, derive the per-litre price
      const lineTotalMajor =
        raw.total != null ? Number(raw.total) :
        raw.total_pence != null ? Number(raw.total_pence) / 100 :
        0;

      if (qty > 0) {
        // If unit is missing OR if qty === 1 but unit looks like a full line total (e.g. £37.50),
        // derive per-litre from the provided total.
        const looksLikeLineTotal = (qty === 1 && lineTotalMajor > 0 && unit > 10);
        if (!unit && lineTotalMajor > 0) unit = lineTotalMajor / qty;
        else if (looksLikeLineTotal) unit = lineTotalMajor / qty;
      }

      return {
        description: raw.description,
        quantity: isFinite(qty) ? qty : 0,
        unitPrice: isFinite(unit) ? unit : 0,
      };
    });

    const { pdfBuffer, filename } = await buildInvoicePdf({
      customer: {
        name: payload.customer.name ?? null,
        email: payload.customer.email,
        address_line1: payload.customer.address_line1 ?? null,
        address_line2: payload.customer.address_line2 ?? null,
        city: payload.customer.city ?? null,
        postcode: payload.customer.postcode ?? null,
      },
      items: normItems,
      currency: (payload.currency || "GBP").toUpperCase(),
      meta: {
        invoiceNumber: payload.meta?.invoiceNumber,
        orderId: payload.meta?.orderId,
        notes: payload.meta?.notes,
      },
    });

    const invNo = payload.meta?.invoiceNumber ?? filename.replace(".pdf", "");
    const subject = `${process.env.COMPANY_NAME || "FuelFlow"} — Invoice ${invNo}`;
    const text = `Hi ${payload.customer.name || "there"},

Thank you for your order. Your invoice ${invNo} is attached.

Kind regards,
${process.env.COMPANY_NAME || "FuelFlow"}`;

    const id = await sendMail({
      to: payload.customer.email,
      bcc: process.env.MAIL_BCC || undefined,
      subject,
      text,
      attachments: [{ filename, content: pdfBuffer, contentType: "application/pdf" }],
    });

    return res.status(200).json({ ok: true, id });
  } catch (e: any) {
    console.error("invoice/create error", e);
    return bad(res, 500, e?.message || "invoice_error");
  }
}
