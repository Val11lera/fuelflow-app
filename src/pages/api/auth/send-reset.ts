import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Placeholder endpoint to unblock builds.
 * If you need password reset emails, replace this with your real logic later.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  // Do nothing server-side. Your frontend already calls Supabase to send the reset email.
  return res.status(200).json({ ok: true, message: "Password reset handled on the client." });
}
