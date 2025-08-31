// src/pages/api/contracts/accept.ts
// /src/pages/api/contracts/accept.ts
import type { NextApiRequest, NextApiResponse } from "next";
import supabase from "@/lib/supabaseAdmin";

const HCAPTCHA_SECRET = process.env.HCAPTCHA_SECRET_KEY || "";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { token, name, email, version } = req.body || {};
    if (!token || !email || !version) {
      return res.status(400).json({ error: "Missing token, email or version" });
    }

    // hCaptcha verification (no node-fetch)
    const form = new URLSearchParams();
    form.set("response", token);
    form.set("secret", HCAPTCHA_SECRET);

    const r = await fetch("https://hcaptcha.com/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const v = await r.json();

    if (!v.success) {
      return res.status(400).json({ error: "Captcha failed", details: v["error-codes"] });
    }

    const { data, error } = await supabase
      .from("terms_acceptances")
      .insert({ name: name || null, email, version })
      .select("id, accepted_at")
      .single();

    if (error) throw error;

    return res.status(200).json({ id: data.id, accepted_at: data.accepted_at });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}

