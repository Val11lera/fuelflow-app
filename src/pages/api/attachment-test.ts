// src/pages/api/attachment-test.ts
// src/pages/api/attachment-test.ts
import type { NextApiRequest, NextApiResponse } from "next";
// If you don't have @ path alias, use the relative import below
import { sendEmail } from "../../lib/mailer"; // from src/pages/api -> ../../lib/mailer

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const to =
      (req.query.to as string) ||
      process.env.MAIL_BCC ||
      "fuelflow.queries@gmail.com";

    const { id } = await sendEmail({
      to,
      subject: "Attachment test",
      text: "Hello attachment!",
      attachments: [
        {
          filename: "test.txt",
          content: Buffer.from("Hello attachment!", "utf8"),
          contentType: "text/plain",
        },
      ],
    });

    // IMPORTANT: don't reference r.ok or r.error here.
    return res.status(200).json({ ok: true, id: id ?? null });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "send_failed" });
  }
}
