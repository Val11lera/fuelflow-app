// src/pages/api/attachment-test.ts
import type { NextApiRequest, NextApiResponse } from "next";

// If you have the @ alias configured (tsconfig paths), use this:
import { sendMail } from "@/lib/mailer";

// If you DON'T have the @ alias, comment the line above and use this relative path instead:
// import { sendMail } from "../../../lib/mailer";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const to =
      (req.query.to as string) ||
      process.env.MAIL_TO_TEST ||
      "you@your-inbox.com";

    const id = await sendMail({
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

    // keep the response shape very simple
    return res.status(200).json({ ok: true, id });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "send_failed" });
  }
}
