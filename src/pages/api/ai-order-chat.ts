// src/pages/api/ai-order-chat.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

type Role = "user" | "assistant";

type ChatMessage = {
  role: Role;
  content: string;
};

type RequestBody = {
  orderId?: string | null;
  userEmail?: string | null;
  messages: ChatMessage[]; // full history from the client
};

type ResponseBody =
  | { reply: string }
  | { error: string };

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

  if (!process.env.OPENAI_API_KEY) {
    return res
      .status(500)
      .json({ error: "OPENAI_API_KEY is not set in .env.local" });
  }

  try {
    const { orderId, userEmail, messages } = req.body as RequestBody;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "No messages provided" });
    }

    // Get latest user message (the new question)
    const latestUserMessage = messages[messages.length - 1];
    if (!latestUserMessage || latestUserMessage.role !== "user") {
      return res.status(400).json({ error: "Last message must be from user" });
    }

    // Pull order + payments + fulfilment notes for extra context
    let orderSummary = "";
    if (orderId) {
      const { data: order, error: orderErr } = await supabaseAdmin
        .from("orders")
        .select(
          "id, created_at, user_email, fuel, litres, unit_price_pence, total_pence, fulfilment_status, fulfilment_notes"
        )
        .eq("id", orderId)
        .single();

      if (!orderErr && order) {
        const { data: payment } = await supabaseAdmin
          .from("payments")
          .select("status, amount, currency")
          .eq("order_id", orderId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const totalPence =
          order.total_pence ??
          (payment?.amount ?? null) ??
          (order.litres && order.unit_price_pence
            ? order.litres * order.unit_price_pence
            : null);

        const amountGbp =
          totalPence != null ? (Number(totalPence) / 100).toFixed(2) : "unknown";

        orderSummary =
          `Order ID: ${order.id}\n` +
          `Created: ${order.created_at}\n` +
          `Customer email: ${order.user_email}\n` +
          `Fuel: ${order.fuel ?? "unknown"}\n` +
          `Litres: ${order.litres ?? "unknown"}\n` +
          `Approx amount: £${amountGbp}\n` +
          `Payment status: ${payment?.status ?? "unknown"}\n` +
          `Fulfilment status: ${order.fulfilment_status ?? "unknown"}\n` +
          `Existing delivery notes: ${
            order.fulfilment_notes || "none"
          }\n`;
      }
    }

    // Build messages for OpenAI
    const apiMessages = [
      {
        role: "system" as const,
        content:
          "You are FuelFlow's AI assistant inside the client dashboard. " +
          "Always be concise, friendly and practical. " +
          "If an order is provided, use its details and existing delivery notes to answer. " +
          "Never invent order data; if you don't know, say you don't know and suggest contacting support.",
      },
      orderSummary
        ? ({
            role: "system" as const,
            content:
              "Context about the selected order:\n" + orderSummary,
          } as const)
        : null,
      ...messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ].filter(Boolean);

    // Call OpenAI
    const apiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: apiMessages,
      }),
    });

    if (!apiRes.ok) {
      const errorText = await apiRes.text();
      console.error("OpenAI error:", errorText);
      return res.status(500).json({ error: "OpenAI API error" });
    }

    const data = await apiRes.json();
    const reply: string =
      data?.choices?.[0]?.message?.content ??
      "Sorry, I couldn't generate a reply.";

    // Save the new user message + AI reply to Supabase (linked to order)
    if (orderId) {
      const inserts = [
        {
          order_id: orderId,
          user_email: userEmail ?? null,
          role: "user" as Role,
          message: latestUserMessage.content,
        },
        {
          order_id: orderId,
          user_email: userEmail ?? null,
          role: "assistant" as Role,
          message: reply,
        },
      ];

      const { error: insertErr } = await supabaseAdmin
        .from("order_ai_messages")
        .insert(inserts);

      if (insertErr) {
        console.error("Failed to insert AI messages:", insertErr);
      }
    }

    return res.status(200).json({ reply });
  } catch (err) {
    console.error("AI order chat error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
