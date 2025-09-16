// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { buildInvoicePdf } from "@/lib/invoice-pdf";
import { sendInvoiceEmail } from "@/lib/mailer";

// Let Next accept slightly larger JSON bodies if needed
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

// Narrow, local type for runtime validation only (keeps build green)
type InvoicePayloadIn = {
  company?: { name?: string };
  customer?: { name?: string; email?: string };
  items?: Array<{ description?: string; quantity?: number; unitPrice?: number }>;
  currency?: string;
  notes?: string;
  email?: boolean;
  invoiceNumber?: string;
  issueDate?: string;
  dueDate?: string;
};

function safeJson(value: unknown) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
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
    // Do NOT import repo-wide types here; keep this route independent.
    const payload = (req.body ?? {}) as InvoicePayloadIn;

    // ---- Basic validation (runtime) ----
    if (!payload?.customer?.email) {
      return res
        .status(400)
        .json({ ok: false, error: "Missing customer.email", debug });
    }
    if (!payload?.items || payload.items.length === 0) {
      return res
        .status(400)
        .json({ ok: false, error: "No items in payload", debug });
    }

    const filename =
      (payload.invoiceNumber ?? `INV-${Date.now()}`) + ".pdf";

    // ---- Build PDF ----
    let pdfBuffer: Buffer;
    try {
      // Cast to any so this compiles even if the shared type changes elsewhere
      pdfBuffer = await buildInvoicePdf(payload as any);
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

    // ---- Prepare email ----
    const to = payload.customer.email!;
    const subject = `Invoice ${filename.replace(".pdf", "")}`;
    const html = `
      <p>Hi ${payload.customer?.name || "there"},</p>
      <p>Please find your invoice attached.</p>
      <p>Regards,<br/>${payload.company?.name ?? "FuelFlow"}</p>
    `;

    let emailed = false;
    let emailId: string | null = null;

    if (payload.email === true) {
      try {
        const result = await sendInvoiceEmail({
          to,
          subject,
          html,
          // Use attachments so this call is type-proof
          attachments: [{ filename, content: pdfBuffer }],
        });

        if (result.ok) {
          emailed = true;
          emailId = result.id;
        } else {
          // Don’t fail the request if email fails—just surface the reason
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

    // ---- Done ----
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

