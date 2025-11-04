// src/pages/api/tickets/[id]/close.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Security model:
 * - Client (your admin dashboard) fetches this route with Authorization: Bearer <supabase access_token>
 * - We verify the token with the service client and ensure the email is in the `admins` table
 * - If OK, we call your SQL function close_ticket(p_ticket_id uuid, p_note text)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const ticketId = String(req.query.id || "").trim();
  if (!ticketId) return res.status(400).json({ error: "Missing ticket id in URL" });

  // Optional reason sent from UI
  const reason =
    (typeof req.body === "object" && req.body?.reason ? String(req.body.reason) : null) || null;

  // Expect an Authorization: Bearer <jwt> from the admin dashboard
  const authHeader = String(req.headers.authorization || "");
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return res.status(401).json({ error: "Missing Authorization bearer token" });

  // Service client lets us verify the token and perform the secure operation
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // 1) Verify the token maps to a real user
  const { data: userData, error: userErr } = await sb.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  const email = (userData.user.email || "").toLowerCase();

  // 2) Check admin allow-list
  const { data: adminRow, error: adminErr } = await sb
    .from("admins")
    .select("email")
    .eq("email", email)
    .maybeSingle();

  if (adminErr) return res.status(500).json({ error: adminErr.message });
  if (!adminRow?.email) return res.status(403).json({ error: "Not an admin" });

  // 3) Call your SQL function to close the ticket (and append a system note)
  const { error: rpcErr } = await sb.rpc("close_ticket", {
    p_ticket_id: ticketId,
    p_note: reason,
  });

  if (rpcErr) return res.status(400).json({ error: rpcErr.message });

  return res.status(200).json({ ok: true });
}

