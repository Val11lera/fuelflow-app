// src/pages/api/attachment-test.ts
// src/pages/api/attachment-test.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { sendInvoiceEmail } from "@/lib/mailer";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const to =
      (req.query.to as string) ||
      process.env.MAIL_BCC ||
      "fuelflow.queries@gmail.com";

    const buf = Buffer.from("Hello attachment!", "utf8");

    const resp = await sendInvoiceEmail({
      to,
      subject: "Attachment test",
      text: "Attachment test",
      html: "<p>Attachment test</p>",
      attachments: [{ filename: "hello.txt", content: buf }],
    });

    res.status(200).json({ ok: true, id: (resp as any)?.id ?? null });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "send_failed" });
  }
}
