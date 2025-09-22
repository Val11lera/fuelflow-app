// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "node:crypto";
import { sendMail } from "@/lib/mailer";
import { buildInvoicePdf } from "@/lib/invoice-pdf";

// ---- Incoming shapes we tolerate ------------------------------------------------
type LineItemIn = {
  description: string;

  // quantity in litres (both spellings supported)
  litres?: number;
  quantity?: number;

  // price variants — any of these may show up
  unitPrice?: number;          // price per litre (major units)
  unit_price_pence?: number;   // price per litre (minor units)
  total?: number;              // line total (major units)
  total_pence?: number;        // line total (minor units)
};

type CustomerIn = {
  name?: string | null;
  email: string;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  postcode?: string | null;
};

type BodyA = {
  customer: CustomerIn;
  items: LineItemIn[];
  currency: string;
  meta?: { invoiceNumber?: string; orderId?: string; notes?: string; litres?: number };
};

type BodyB = {
  order: {
    id?: string;
    customer: { name?: string; email: string };
    items: LineItemIn[];
    currency: string;
    notes?: string;
    litres?: number;
  };
  options?: { email?: boolean; bcc?: string | null };
};

export const config = { api: { bodyParser: true } };

// ---- helpers -------------------------------------------------------------------
function bad(res: NextApiResponse, code: number, msg: string) {
  return res.status(code).json({ ok: false, error: msg });
}
function safeEqual(a: string, b: string) {
  const A = Buffer.from(a, "utf8");
  const B = Buffer.from(b, "utf8");
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}
function n(v: unknown, d = 0) { const x = Number(v); return Number.isFinite(x) ? x : d; }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return bad(res, 405, "Method Not Allowed");

  const expected = process.env.INVOICE_SECRET;
  if (!expected) return bad(res, 500, "INVOICE_SECRET not set");
  const provided = String(req.headers["x-invoice-secret"] || "");
  if (!provided || !safeEqual(provided, expected)) return bad(res, 401, "Invalid invoice secret");

  // ----- Accept both top-level (BodyA) and { order: ... } (BodyB) payloads -----
  const raw = req.body as BodyA | BodyB;
  const hasOrderWrapper = (raw as BodyB).order && (raw as BodyB).order.items;

  const customer: CustomerIn = hasOrderWrapper
    ? {
        name: (raw as BodyB).order.customer.name ?? null,
        email: (raw as BodyB).order.customer.email,
      }
    : (raw as BodyA).customer;

  const itemsIn: LineItemIn[] = hasOrderWrapper ? (raw as BodyB).order.items : (raw as BodyA).items;
  const currency: string = hasOrderWrapper ? (raw as BodyB).order.currency : (raw as BodyA).currency;

  // Provide a fallback "order-level litres" if submitter forgot to set per-line qty
  const orderLevelLitres = hasOrderWrapper
    ? n((raw as BodyB).order.litres, n((raw as BodyA).meta?.litres, 0))
    : n((raw as BodyA).meta?.litres, 0);

  const meta = hasOrderWrapper
    ? {
        invoiceNumber: (raw as BodyA as any)?.meta?.invoiceNumber, // if caller included one
        orderId: (raw as BodyB).order.id,
        notes: (raw as BodyB).order.notes,
      }
    : (raw as BodyA).meta ?? {};

  if (!customer?.email) return bad(res, 400, "Missing customer.email");
  if (!Array.isArray(itemsIn) || itemsIn.length === 0) return bad(res, 400, "Missing items");
  if (!currency) return bad(res, 400, "Missing currency");

  const debug = String(req.headers["x-invoice-debug"] || req.query.debug || "") === "1";

  // ---- Normalize each line: litres + price-per-litre ---------------------------
  const normItems = itemsIn.map((rawLine) => {
    // quantity of litres
    let qty = n(rawLine.quantity ?? rawLine.litres, 0);
    if (!qty && orderLevelLitres > 0) qty = orderLevelLitres; // as a rescue fallback

    // unit price (major units)
    let unit = n(rawLine.unitPrice, 0);
    if (!unit && rawLine.unit_price_pence != null) unit = n(rawLine.unit_price_pence, 0) / 100;

    // if unit missing (or looks like a line-total given with qty===1), derive from total
    const lineTotal = rawLine.total != null ? n(rawLine.total, 0)
                    : rawLine.total_pence != null ? n(rawLine.total_pence, 0) / 100
                    : 0;

    if (qty > 0) {
      const looksLikeLineTotal = (qty === 1 && unit > 10 && lineTotal > 0);
      if (!unit && lineTotal > 0) unit = lineTotal / qty;
      else if (looksLikeLineTotal) unit = lineTotal / qty;
    }

    return {
      description: rawLine.description,
      quantity: qty,
      unitPrice: unit,
      _debug_raw: debug ? rawLine : undefined,
    };
  });

  try {
    const { pdfBuffer, filename, pages } = await buildInvoicePdf({
      customer: {
        name: customer.name ?? null,
        email: customer.email,
        address_line1: customer.address_line1 ?? null,
        address_line2: customer.address_line2 ?? null,
        city: customer.city ?? null,
        postcode: customer.postcode ?? null,
      },
      items: normItems.map(({ description, quantity, unitPrice }) => ({ description, quantity, unitPrice })),
      currency: (currency || "GBP").toUpperCase(),
      meta,
    });

    const invNo = meta?.invoiceNumber ?? filename.replace(".pdf", "");
    const subject = `${process.env.COMPANY_NAME || "FuelFlow"} — Invoice ${invNo}`;
    const text = `Hi ${customer.name || "there"},

Thank you for your order. Your invoice ${invNo} is attached.

Kind regards,
${process.env.COMPANY_NAME || "FuelFlow"}`;

    const id = await sendMail({
      to: customer.email,
      bcc: process.env.MAIL_BCC || undefined,
      subject,
      text,
      attachments: [{ filename, content: pdfBuffer, contentType: "application/pdf" }],
    });

    if (debug) {
      res.setHeader("X-FF-Pages", String(pages ?? "?"));
      return res.status(200).json({
        ok: true,
        id,
        debug: {
          receivedShape: hasOrderWrapper ? "BodyB(order)" : "BodyA",
          normalized: normItems.map(({ description, quantity, unitPrice }) => ({ description, quantity, unitPrice })),
          pages,
        },
      });
    }

    return res.status(200).json({ ok: true, id });
  } catch (e: any) {
    console.error("invoice/create error", e);
    return bad(res, 500, e?.message || "invoice_error");
  }
}
