// src/pages/api/attachment-test.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { sendEmail } from "@/lib/mailer";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const to = (req.query.to as string) || process.env.MAIL_BCC?.split(",")[0] || "fuelflow.queries@gmail.com";
  const buf = Buffer.from("Hello attachment!", "utf8");

  const r = await sendEmail({
    to,
    subject: "Attachment test",
    html: "<p>Attachment test</p>",
    text: "Attachment test",
    attachments: [{ filename: "test.txt", content: buf, contentType: "text/plain" }],
  });

  res.status(200).json({ ok: r.ok, id: r.id ?? null, error: r.error ?? null });
}
