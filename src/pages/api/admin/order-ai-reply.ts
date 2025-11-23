// src/pages/api/admin/order-ai-reply.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

type Body = {
  orderId: string;
  userEmail: string | null;
  adminEmail: string; // who's replying
  reply: string;
};

type ResponseBody = { ok: true } | { error: string };

const supabaseAdmin = createClient(
  (process.env.SUPABASE_URL as string) ||
    (process.env.NEXT_PUBLIC_SUPABASE_URL as string),
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseBody>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { orderId, userEmail, adminEmail, reply } = req.body as Body;

    if (!orderId || !reply || !adminEmail) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Insert as another assistant-style message, but tied to this admin
    const row: any = {
      order_id: orderId,
      user_email: userEmail ?? null,
      role: "assistant", // client chat will treat it as assistant
      message: reply,
      // If you added a sender_email column in order_ai_messages, this will populate it:
      sender_email: adminEmail,
    };

    const { error } = await supabaseAdmin
      .from("order_ai_messages")
      .insert(row);

    if (error) {
      console.error("Failed to insert admin reply:", error);
      return res.status(500).json({ error: "Failed to save reply" });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Admin order-ai-reply error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
