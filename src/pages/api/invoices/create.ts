// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { buildInvoicePdf } from "@/lib/invoice-pdf";
import { sendInvoiceEmail } from "@/lib/mailer";

export const config = { api: { bodyParser: { sizeLimit: "5mb" } } };

type OkJson = {
  ok: true;
  filename: string;
  emailed: boolean;
  emailId: string | null;
  debug?: Record<string, unknown>;
};

type ErrJson = {
  ok: false;
  error: string;
  where?: string;
  details?: unknown;
  debug?: Record<string, unknown>;
};

function safeJson(value: unknown) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

// Accept items OR lineItems, and normalize to items
function pickItems(payload: any): any[] {
  const a = Array.isArray(payload?.items) ? payload.items : null;
  const b = Array.isArray(payload?.lineItems) ? payload.lineItems : null;
  return (a ?? b ?? []).filter(Boolean);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<OkJson | ErrJson>
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Use POST" });
  }

  const debug: Record<string, unknown> = {
    hasResendKey: Boolean(process.env.RESEND_API_KEY),
    mailFrom: process.env.MAIL_FROM ?? null,
    ts: new Date().toISOString(),
  };

  try {
    const payload = (req.body ?? {}) as any;

    // diagnostics: show top-level keys we received
    try {
      debug.receivedKeys = Object.keys(payload || {});
    } catch {
      /* ignore */
    }

    // normalize items
    const items = pickItems(payload);
    if (!items || items.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "No items in payload",
        debug,
      });
    }

    // we pass a payload that definitely has .items
    const normalized = { ...payload, items };

    if (!normalized?.customer?.email) {
      return res
        .status(400)
        .json({ ok: false, error: "Missing customer.email", debug });
    }

    const filename =
      (normalized.invoiceNumber ?? `INV-${Date.now()}`) + ".pdf";

    // ---- Build PDF ---------------------------------------------------------
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await buildInvoicePdf(normalized);
    } catch (e: any) {
      console.error("[create] PDF build failed:", e);
      return res.status(500).json({
        ok: false,
        error: e?.message ?? "PDF build failed",
        where: "buildInvoicePdf",
        details: safeJson(e),
        debug,
      });
    }

    // ---- Email (optional) --------------------------------------------------
    const to = normalized.customer.email as string;
    const subject = `Invoice ${filename.replace(".pdf", "")}`;
    const html = `
      <p>Hi ${normalized.customer?.name || "there"},</p>
      <p>Please find your invoice attached.</p>
      <p>Regards,<br/>${normalized.company?.name ?? "FuelFlow"}</p>
    `;

    let emailed = false;
    let emailId: string | null = null;

    if (normalized.email === true) {
      try {
        const result = await sendInvoiceEmail({
          to,
          subject,
          html,
          attachments: [{ filename, content: pdfBuffer }],
        });

        if (result.ok) {
          emailed = true;
          emailId = result.id;
        } else {
          console.error("[create] Email send failed:", result.error);
          debug.emailError = result.error;
        }
      } catch (e: any) {
        console.error("[create] Email send threw:", e);
        return res.status(500).json({
          ok: false,
          error: e?.message ?? "Email send failed",
          where: "sendInvoiceEmail",
          details: safeJson(e),
          debug,
        });
      }
    }

    return res.status(200).json({ ok: true, filename, emailed, emailId, debug });
  } catch (e: any) {
    console.error("[create] Uncaught error:", e);
    return res.status(500).json({
      ok: false,
      error: e?.message ?? "Server error",
      where: "handler",
      details: safeJson(e),
      debug,
    });
  }
}
