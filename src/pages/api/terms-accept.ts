// src/pages/api/terms-accept.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

type Body = {
  version?: string;
  name?: string | null;
  email?: string | null;
  captchaToken?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).send("Method Not Allowed");
  }

  const { version, name, email, captchaToken } = (req.body || {}) as Body;

  if (!version) return res.status(400).send("Missing version");
  // Your terms_acceptances has email NOT NULL. Treat it as required here.
  if (!email || !email.trim()) return res.status(400).send("Email is required");

  // Optional: verify hCaptcha only if a secret is configured
  try {
    const secret = process.env.HCAPTCHA_SECRET;
    if (secret) {
      const resp = await fetch("https://hcaptcha.com/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret,
          response: captchaToken || "",
        }),
      });
      const data = await resp.json();
      if (!data.success) {
        return res.status(400).send("Captcha failed");
      }
    }
  } catch {
    // If hCaptcha check explodes, block (safer)
    return res.status(400).send("Captcha check failed");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  // Use service role if you have it; else anon also works given your open INSERT policy.
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Insert and RETURN the id
  const { data, error } = await supabase
    .from("terms_acceptances")
    .insert([{ version, name: name || null, email: email.trim() }])
    .select("id")
    .single();

  if (error) {
    return res.status(400).send(error.message || "Insert failed");
  }

  return res.status(200).json({ id: data.id });
}
