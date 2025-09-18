import type { NextApiRequest, NextApiResponse } from "next";
import { sendInvoiceEmail } from "@/lib/mailer";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const to = (req.query.to as string) || "fuelflow.queries@gmail.com";
    const buf = Buffer.from("Hello attachment!", "utf8"); // small, valid payload
    const { id } = await sendInvoiceEmail({
      to,
      subject: "Attachment test",
      html: "<p>Attachment test</p>",
      attachments: [{ filename: "test.txt", content: buf }],
    });
    return res.status(200).json({ ok: Boolean(id), id });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}
