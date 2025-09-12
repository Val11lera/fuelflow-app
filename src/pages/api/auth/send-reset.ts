// @ts-nocheck
import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Minimal placeholder to unblock builds.
 * Your frontend already handles sending the reset via Supabase.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  return res.status(200).json({ ok: true, message: "Password reset handled on the client." });
}
