// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import type { InvoicePayload } from "@/types/invoice";
import { buildInvoicePdf } from "@/lib/invoice-pdf";
import { sendInvoiceEmail } from "@/lib/mailer";

// Increase body size if your payload grows (PDF is built server-side, not uploaded)
export const config = {
  api: { bodyParser: { sizeLimit: "5mb" } },
};

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
  where?: string;           // which step failed
  details?: unknown;        // raw error content
  debug?: Record<string, unknown>;
};

function safe(value: unknown) {
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
    const payload = req.body as InvoicePayload;

    // Basic validation
    if (!payload?.customer?.email) {
      return res
        .status(400)
        .json({ ok: false, error: "Missing customer.email", debug });
    }
    if (!payload?.items?.length) {
      return res
        .status(400)
        .json({ ok: false, error: "No items in payload", debug });
    }

    const filename =
      (payload.invoiceNumber ?? `INV-${Date.now()}`) + ".pdf";

    // ---- Build PDF ---------------------------------------------------------
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await buildInvoicePdf(payload);
    } catch (e: any) {
      console.error("[create] PDF build failed:", e);
      return res.status(500).json({
        ok: false,
        error: e?.message ?? "PDF build failed",
        where: "buildInvoicePdf",
        details: safe(e),
        debug,
      });
    }

    // ---- Possibly send email ----------------------------------------------
    const to = payload.customer.email;
    const subject = `Invoice ${filename.replace(".pdf", "")}`;
    const html = `
      <p>Hi ${payload.customer.name},</p>
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
          // use attachments path so types can’t break this call
          attachments: [
            { filename, content: pdfBuffer }, // Buffer directly
          ],
        });

        if (result.ok) {
          emailed = true;
          emailId = result.id;
        } else {
          console.error("[create] Email send failed:", result.error);
          // do NOT hard-fail the whole request; report failure in response
          debug.emailError = result.error;
        }
      } catch (e: any) {
        console.error("[create] Email send threw:", e);
        return res.status(500).json({
          ok: false,
          error: e?.message ?? "Email send failed",
          where: "sendInvoiceEmail",
          details: safe(e),
          debug,
        });
      }
    }

    // Done
    return res.status(200).json({
      ok: true,
      filename,
      emailed,
      emailId,
      debug,
    });
  } catch (e: any) {
    console.error("[create] Uncaught error:", e);
    return res.status(500).json({
      ok: false,
      error: e?.message ?? "Server error",
      where: "handler",
      details: safe(e),
      debug,
    });
  }
}
