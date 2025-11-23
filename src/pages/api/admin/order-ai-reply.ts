// src/pages/api/admin/order-ai-reply.ts
// src/pages/api/admin/order-ai-reply.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

type Body = {
  conversationId: string;          // ai_order_questions.id
  orderId: string | null;
  userEmail: string | null;
  adminEmail: string;              // who is replying
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
    const { conversationId, orderId, userEmail, adminEmail, reply } =
      req.body as Body;

    if (!conversationId || !reply || !adminEmail) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // 1) Insert the admin reply as another assistant-style message
    const row: any = {
      order_id: orderId,
      user_email: userEmail,
      role: "assistant", // client chat treats this as assistant/human reply
      message: reply,
      // If your table has this column, it's nice to populate
      sender_email: adminEmail,
    };

    const { error: insertErr } = await supabaseAdmin
      .from("order_ai_messages")
      .insert(row);

    if (insertErr) {
      console.error("Failed to insert admin reply:", insertErr);
      return res.status(500).json({ error: "Failed to save reply" });
    }

    // 2) Mark the conversation as handled_by_admin (so it disappears from "Escalated only")
    const { error: updateErr } = await supabaseAdmin
      .from("ai_order_questions")
      .update({
        status: "handled_by_admin",
        escalated: false,
      } as any)
      .eq("id", conversationId);

    if (updateErr) {
      console.error("Failed to update ai_order_questions:", updateErr);
      // don't fail the whole request; the important part (message) is saved
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Admin order-ai-reply error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

