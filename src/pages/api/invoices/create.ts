// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "node:crypto";
import { sendMail } from "@/lib/mailer";
import { buildInvoicePdf } from "@/lib/invoice-pdf"; // <-- use the fixed, shared generator

// ---- Request types (kept exactly as you described) ----
type LineItem = {
  description: string;
  quantity: number;          // litres
  unitPrice: number;         // major units (e.g., 1.71 = £1.71)
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
  currency: string; // "GBP" | "EUR" | "USD" | etc
  meta?: {
    invoiceNumber?: string;
    orderId?: string;
    notes?: string;
  };
};

export const config = {
  api: { bodyParser: true }, // keep JSON parsing
};

// ---- Small helpers (unchanged behaviour) ----
function bad(res: NextApiResponse, code: number, msg: string) {
  return res.status(code).json({ ok: false, error: msg });
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

// ---- Handler ----
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return bad(res, 405, "Method Not Allowed");

  // Secret check (timing-safe)
  const expected = process.env.INVOICE_SECRET;
  if (!expected) return bad(res, 500, "INVOICE_SECRET not set");
  const provided = String(req.headers["x-invoice-secret"] || "");
  if (!provided || !safeEqual(provided, expected)) return bad(res, 401, "Invalid invoice secret");

  // Validate minimal fields (same checks you had)
  const payload = req.body as InvoicePayload;
  if (!payload?.customer?.email) return bad(res, 400, "Missing customer.email");
  if (!Array.isArray(payload.items) || payload.items.length === 0) return bad(res, 400, "Missing items");
  if (!payload.currency) return bad(res, 400, "Missing currency");

  try {
    // Build the PDF using the shared, fixed generator (single-page, no overlap)
    const { pdfBuffer, filename } = await buildInvoicePdf({
      customer: {
        name: payload.customer.name ?? null,
        email: payload.customer.email,
        address_line1: payload.customer.address_line1 ?? null,
        address_line2: payload.customer.address_line2 ?? null,
        city: payload.customer.city ?? null,
        postcode: payload.customer.postcode ?? null,
      },
      items: payload.items.map(i => ({
        description: i.description,
        quantity: Number(i.quantity || 0),
        unitPrice: Number(i.unitPrice || 0),
      })),
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
      bcc: process.env.MAIL_BCC || undefined, // still supported
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

