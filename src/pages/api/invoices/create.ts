// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "node:crypto";
import { sendMail } from "@/lib/mailer";
import { buildInvoicePdf } from "@/lib/invoice-pdf"; // shared generator

// Upstream may send different shapes; we normalize them here.
type LineItemIn = {
  description: string;

  // quantity shapes
  litres?: number;             // common in your system
  quantity?: number;           // alias for litres

  // pricing shapes
  unitPrice?: number;          // price per litre (major units)
  unit_price_pence?: number;   // price per litre (minor units)
  total?: number;              // line total (major units)
  total_pence?: number;        // line total (minor units)
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
  meta?: { invoiceNumber?: string; orderId?: string; notes?: string };
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
    // ---- DEBUG flag (optional): set header x-invoice-debug: 1 on the request to get echo data back
    const debug = String(req.headers["x-invoice-debug"] || "") === "1";

    // ---- Normalize items: accept litres OR quantity; derive unit price from totals when needed
    const normItems = payload.items.map((raw) => {
      const qty = Number(raw.quantity ?? raw.litres ?? 0);

      // major-units unit price if provided
      let unit = Number(raw.unitPrice ?? 0);
      if (!unit && raw.unit_price_pence != null) unit = Number(raw.unit_price_pence) / 100;

      // line total (if the caller sent total instead of unit price)
      const lineTotal =
        raw.total != null ? Number(raw.total) :
        raw.total_pence != null ? Number(raw.total_pence) / 100 :
        0;

      if (qty > 0) {
        // If unit is missing OR looks like they sent the full line total as "unitPrice" with qty===1,
        // use the provided total to derive proper per-litre price.
        const looksLikeLineTotal = (qty === 1 && unit > 10 && lineTotal > 0);
        if (!unit && lineTotal > 0) unit = lineTotal / qty;
        else if (looksLikeLineTotal) unit = lineTotal / qty;
      }

      return {
        description: raw.description,
        quantity: Number.isFinite(qty) ? qty : 0,
        unitPrice: Number.isFinite(unit) ? unit : 0,
        _debug_raw: debug ? raw : undefined, // only for debug echo
      };
    });

    // ---- Build the PDF using the shared, fixed generator
    const { pdfBuffer, filename, pages } = await buildInvoicePdf({
      customer: {
        name: payload.customer.name ?? null,
        email: payload.customer.email,
        address_line1: payload.customer.address_line1 ?? null,
        address_line2: payload.customer.address_line2 ?? null,
        city: payload.customer.city ?? null,
        postcode: payload.customer.postcode ?? null,
      },
      items: normItems.map(({ description, quantity, unitPrice }) => ({ description, quantity, unitPrice })),
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

    // If debugging, echo what the route actually used + page count
    if (debug) {
      res.setHeader("X-FF-Pages", String(pages ?? "?"));
      return res.status(200).json({
        ok: true,
        id,
        debug: {
          received: payload.items,
          normalized: normItems.map(i => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice })),
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
