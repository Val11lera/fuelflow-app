import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CONFIRMATION_FROM_EMAIL || "onboarding@resend.dev";
  const to = (req.query.to as string) || from; // send to yourself if ?to= not provided

  const diag = {
    hasApiKey: !!apiKey,
    fromIsSet: !!process.env.CONFIRMATION_FROM_EMAIL,
    usingFrom: from,
    to,
  };

  if (!apiKey) return res.status(500).json({ ...diag, error: "missing RESEND_API_KEY" });

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        subject: "FuelFlow email-diag test",
        html: "<p>If you can read this, Resend is wired up ✅</p>",
      }),
    });

    const text = await resp.text().catch(() => "");
    let json: any;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }

    return res.status(resp.ok ? 200 : 500).json({
      ...diag,
      ok: resp.ok,
      status: resp.status,
      statusText: resp.statusText,
      response: json ?? null,
    });
  } catch (e: any) {
    return res.status(500).json({ ...diag, ok: false, exception: e?.message || String(e) });
  }
}
