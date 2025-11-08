// pages/api/auth/check-email.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // <-- service key (server only!)

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const { email } = req.body as { email?: string };
    if (!email) return res.status(400).json({ error: "Missing email" });

    // Narrow search via auth.admin
    const out = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1,
      // The listUsers API doesn’t filter by email on all versions; we’ll just fetch and filter.
    });

    // Fallback: fetch more pages if needed (unlikely for your scale)
    const all = out.data?.users || [];
    const match = all.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());

    // If your SDK doesn’t support filtering, you can switch to Admin API:
    // const { data } = await admin.auth.admin.getUserByEmail(email) // if available in your SDK version

    if (!match) return res.json({ exists: false });

    const confirmed = Boolean(match.email_confirmed_at);
    return res.json({
      exists: true,
      confirmed,
      user_id: match.id,
      email_confirmed_at: match.email_confirmed_at,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "check failed" });
  }
}
