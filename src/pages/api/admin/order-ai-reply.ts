// src/pages/api/admin/order-ai-reply.ts
// src/pages/api/admin/order-ai-reply.ts
// Handles admin replies to escalated order conversations

import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

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
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body || {};

    const conversationId = body.conversationId || null; // ai_order_questions.id
    const orderId = body.orderId || null;
    const userEmail = body.userEmail || null;
    const adminEmail = body.adminEmail || null;
    const reply = body.reply || "";

    //
    // -------------------------------
    // Validate fields
    // -------------------------------
    //
    if (!reply || !adminEmail) {
      return res
        .status(400)
        .json({ error: "Missing required fields (reply, adminEmail)" });
    }

    // Note — conversationId is optional so older conversations can still be answered.
    // userEmail is optional because not all conversations may include it.
    // orderId is optional for generic customer questions.
    //

    const supabase = getSupabaseAdmin();

    //
    // -------------------------------
    // 1) Insert the admin reply message
    // -------------------------------
    //
    const insertPayload: any = {
      order_id: orderId,
      user_email: userEmail,
      role: "assistant", // your UI uses this to detect admin/AI side
      message: reply,
      sender_email: adminEmail,
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
    // -------------------------------
    // 2) Mark conversation as handled (if conversationId exists)
    // -------------------------------
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
          "Warning: Failed to update ai_order_questions:",
          updateErr
        );
        // Don't fail the request — the important part (admin message) is saved
      }
    }

    //
    // -------------------------------
    // DONE
    // -------------------------------
    //
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("order-ai-reply unexpected error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

