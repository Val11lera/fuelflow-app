import type { NextApiRequest, NextApiResponse } from "next";
import { Resend } from "resend";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const apiKey = process.env.RESEND_API_KEY || "";
  const from = process.env.MAIL_FROM || "FuelFlow <invoices@mail.fuelflow.co.uk>";
  const to = (req.query.to as string) || "fuelflow.queries@gmail.com";

  if (!apiKey) {
    return res.status(400).json({ ok: false, error: "RESEND_API_KEY missing" });
  }

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject: "FuelFlow test email",
      html: `<p>Hello! This is a Resend connectivity test.</p>`
    });

    return res.status(200).json({
      ok: !error,
      data,   // contains { id } on success
      error,  // shows the exact reason on failure
      debug: { from, hasKey: Boolean(apiKey) }
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}
