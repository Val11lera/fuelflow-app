// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { sendMail } from "@/lib/mailer";
import { buildInvoicePdf } from "@/lib/invoice-pdf";

export const config = { api: { bodyParser: true } };

type ApiItem =
  | { description: string; litres: number; unitPrice?: number; total?: number }
  | { description: string; quantity: number; unitPrice?: number; total?: number };

type ApiPayload = {
  customer: {
    name?: string | null;
    email: string;
    address?: string | null;      // legacy multi-line
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

function bad(res: NextApiResponse, code: number, msg: string) {
  return res.status(code).json({ ok: false, error: msg });
}

/** Short, unique invoice numbers.
 *  - If orderId: INV-<first4><last4>  (e.g. INV-AB12Z9QP)
 *  - Else:       INV-YYMMDD-XXXX      (e.g. INV-250922-7F3K)
 */
function makeInvoiceNumber(meta: { invoiceNumber?: string; orderId?: string } | undefined) {
  if (meta?.invoiceNumber) return meta.invoiceNumber;
  if (meta?.orderId) {
    const id = String(meta.orderId).replace(/[^A-Za-z0-9]/g, "");
    const a = id.slice(0, 4).toUpperCase().padEnd(4, "X");
    const b = id.slice(-4).toUpperCase().padStart(4, "X");
    return `INV-${a}${b}`;
  }
  const d = new Date();
  const y = String(d.getFullYear()).slice(-2);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase(); // 4 chars
  return `INV-${y}${m}${day}-${rand}`;
}

function normalizeItems(items: ApiItem[]) {
  return items.map((it) => {
    const litres =
      typeof (it as any).litres === "number"
        ? (it as any).litres
        : (it as any).quantity ?? 0;
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

  if (!process.env.INVOICE_SECRET) return bad(res, 500, "INVOICE_SECRET not set");
  const secret = req.headers["x-invoice-secret"];
  if (!secret || secret !== process.env.INVOICE_SECRET) return bad(res, 401, "Invalid invoice secret");

  const payload = req.body as ApiPayload;
  if (!payload?.customer?.email) return bad(res, 400, "Missing customer.email");
  if (!Array.isArray(payload.items) || payload.items.length === 0) return bad(res, 400, "Missing items");
  if (!payload.currency) return bad(res, 400, "Missing currency");

  const debug =
    String(req.query.debug ?? req.headers["x-invoice-debug"] ?? "").toLowerCase() === "1";

  try {
    const normItems = normalizeItems(payload.items);

    const meta = {
      invoiceNumber: makeInvoiceNumber(payload.meta),
      orderId: payload.meta?.orderId,
      notes: payload.meta?.notes,
      dateISO: payload.meta?.dateISO,
    };

    const c = payload.customer;
    let address_line1 = c.address_line1 ?? null;
    let address_line2 = c.address_line2 ?? null;
    if (!address_line1 && c.address) {
      const parts = c.address.replace(/\\n/g, "\n").split("\n");
      address_line1 = parts[0] ?? null;
      address_line2 = parts.slice(1).join(", ") || null;
    }

    const { pdfBuffer, filename, pages } = await buildInvoicePdf({
      customer: {
        name: c.name ?? null,
        email: c.email,
        address_line1,
        address_line2,
        city: c.city ?? null,
        postcode: c.postcode ?? null,
      },
      items: normItems.map(({ description, quantity, unitPrice }) => ({ description, quantity, unitPrice })),
      currency: (payload.currency || "GBP").toUpperCase(),
      meta,
    });

    const invNo = meta.invoiceNumber;
    const subject = `${process.env.COMPANY_NAME || "FuelFlow"} — Invoice ${invNo}`;
    const text = `Hi ${c.name || "there"},

Thank you for your order. Your invoice ${invNo} is attached.

Kind regards,
${process.env.COMPANY_NAME || "FuelFlow"}`;

    const id = await sendMail({
      to: c.email,
      bcc: process.env.MAIL_BCC || undefined,
      subject,
      text,
      attachments: [
        { filename: `${invNo}.pdf`, content: pdfBuffer, contentType: "application/pdf" },
      ],
    });

    if (debug) {
      return res.status(200).json({
        ok: true,
        id,
        debug: { normalized: normItems, invoiceNumber: invNo, pages },
      });
    }
    return res.status(200).json({ ok: true, id });
  } catch (e: any) {
    console.error("invoice/create error", e);
    return bad(res, 500, e?.message || "invoice_error");
  }
}
