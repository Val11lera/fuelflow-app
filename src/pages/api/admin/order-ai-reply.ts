// src/pages/api/admin/order-ai-reply.ts
// src/pages/api/admin/order-ai-reply.ts
// Handles admin replies to escalated order conversations

import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

type Body = {
  conversationId?: string | null;   // ai_order_questions.id
  orderId?: string | null;          // public.orders.id
  userEmail?: string | null;        // customer email
  adminEmail?: string | null;       // who is replying (admin)
  reply?: string | null;            // message text
};

type ResponseBody = { ok: true } | { error: string };

function getSupabaseAdmin() {
  const url =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables"
    );
  }

  return createClient(url, key);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseBody>
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { conversationId, orderId, userEmail, adminEmail, reply } =
      (req.body || {}) as Body;

    // These are required so the client dashboard can find the message
    if (!orderId || !userEmail || !reply || !adminEmail) {
      return res.status(400).json({
        error:
          "Missing required fields (orderId, userEmail, reply, adminEmail)",
      });
    }

    const supabase = getSupabaseAdmin();

    //
    // 1) Insert the admin reply into order_ai_messages
    //
    const insertPayload: any = {
      order_id: orderId,
      user_email: userEmail,
      role: "assistant",        // allowed by your CHECK (user | assistant)
      message: reply,
      sender_email: adminEmail, // new column we added
    };

    const { error: insertErr } = await supabase
      .from("order_ai_messages")
      .insert(insertPayload);

    if (insertErr) {
      console.error("Error inserting admin reply:", insertErr);
      return res
        .status(500)
        .json({ error: insertErr.message || "Failed to save reply" });
    }

    //
    // 2) Mark the conversation as handled_by_admin (if we know which one)
    //
    if (conversationId) {
      const { error: updateErr } = await supabase
        .from("ai_order_questions")
        .update({
          status: "handled_by_admin",
          escalated: false,
        })
        .eq("id", conversationId);

      if (updateErr) {
        console.error(
          "Warning: failed to update ai_order_questions:",
          updateErr
        );
        // Do not fail the whole request; the reply is already stored.
      }
    }

    //
    // Done
    //
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Admin order-ai-reply error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

