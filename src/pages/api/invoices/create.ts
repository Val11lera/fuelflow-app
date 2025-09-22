// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { sendMail } from "@/lib/mailer";
import { buildInvoicePdf } from "@/lib/invoice-pdf";

export const config = { api: { bodyParser: true } };

/* ---------- Types incoming from callers ---------- */
type ApiItem =
  | { description: string; litres: number; unitPrice?: number; total?: number; vatRate?: number }
  | { description: string; quantity: number; unitPrice?: number; total?: number; vatRate?: number };

type ApiPayload = {
  customer: {
    name?: string | null;
    email: string;
    address?: string | null; // legacy multi-line
    address_line1?: string | null;
    address_line2?: string | null;
    city?: string | null;
    postcode?: string | null;
  };
  items: ApiItem[];
  currency: string;
  meta?: {
    invoiceNumber?: string;
    orderId?: string;
    notes?: string;
    dateISO?: string;
  };
};

/* ---------- Helpers ---------- */
function bad(res: NextApiResponse, code: number, msg: string) {
  return res.status(code).json({ ok: false, error: msg });
}

function makeInvoiceNumber(meta: { invoiceNumber?: string; orderId?: string } | undefined) {
  if (meta?.invoiceNumber) return meta.invoiceNumber;
  if (meta?.orderId) return `INV-${meta.orderId}`;
  const d = new Date();
  const ymd = [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("");
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase(); // 6 chars
  return `INV-${ymd}-${rand}`;
}

/** Normalize items: prefer litres if present; else quantity. If only "total" supplied, derive unit. */
function normalizeItems(items: ApiItem[]) {
  return items.map((it) => {
    const litres = typeof (it as any).litres === "number" ? (it as any).litres : (it as any).quantity ?? 0;
    let unitPrice = (it as any).unitPrice as number | undefined;
    const total = (it as any).total as number | undefined;
    if ((unitPrice == null || isNaN(unitPrice)) && typeof total === "number" && litres) {
      unitPrice = total / litres;
    }
    return {
      description: (it as any).description || "Item",
      quantity: Number(litres || 0),
      unitPrice: Number(unitPrice || 0),
    };
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return bad(res, 405, "Method Not Allowed");

  // Secret check
  if (!process.env.INVOICE_SECRET) return bad(res, 500, "INVOICE_SECRET not set");
  const secret = req.headers["x-invoice-secret"];
  if (!secret || secret !== process.env.INVOICE_SECRET) return bad(res, 401, "Invalid invoice secret");

  const payload = req.body as ApiPayload;
  if (!payload?.customer?.email) return bad(res, 400, "Missing customer.email");
  if (!Array.isArray(payload.items) || payload.items.length === 0) return bad(res, 400, "Missing items");
  if (!payload.currency) return bad(res, 400, "Missing currency");

  const debugRequested =
    String(req.query.debug ?? req.headers["x-invoice-debug"] ?? "").toLowerCase() === "1";

  try {
    // 1) Normalize input
    const normItems = normalizeItems(payload.items);
    const meta = {
      invoiceNumber: makeInvoiceNumber(payload.meta),
      orderId: payload.meta?.orderId,
      notes: payload.meta?.notes,
      dateISO: payload.meta?.dateISO,
    };

    const customer = payload.customer;
    // Expand legacy address into lines if provided
    let addr1 = customer.address_line1 ?? null;
    let addr2 = customer.address_line2 ?? null;
    if (!addr1 && customer.address) {
      const parts = customer.address.replace(/\\n/g, "\n").split("\n");
      addr1 = parts[0] ?? null;
      addr2 = parts.slice(1).join(", ") || null;
    }

    // 2) Build PDF
    const { pdfBuffer, filename, pages } = await buildInvoicePdf({
      customer: {
        name: customer.name ?? null,
        email: customer.email,
        address_line1: addr1,
        address_line2: addr2,
        city: customer.city ?? null,
        postcode: customer.postcode ?? null,
      },
      items: normItems.map(({ description, quantity, unitPrice }) => ({
        description,
        quantity,
        unitPrice,
      })),
      currency: (payload.currency || "GBP").toUpperCase(),
      meta,
    });

    const invNo = meta.invoiceNumber;
    const subject = `${process.env.COMPANY_NAME || "FuelFlow"} — Invoice ${invNo}`;
    const text = `Hi ${customer.name || "there"},

Thank you for your order. Your invoice ${invNo} is attached.

Kind regards,
${process.env.COMPANY_NAME || "FuelFlow"}`;

    // 3) Send email
    const id = await sendMail({
      to: customer.email,
      bcc: process.env.MAIL_BCC || undefined,
      subject,
      text,
      attachments: [
        { filename: `${invNo}.pdf`, content: pdfBuffer, contentType: "application/pdf" },
      ],
    });

    // 4) Response (with optional debug echo)
    if (debugRequested) {
      return res.status(200).json({
        ok: true,
        id,
        debug: {
          normalized: normItems,
          invoiceNumber: invNo,
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

