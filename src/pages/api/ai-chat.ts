// src/pages/api/ai-chat.ts
import type { NextApiRequest, NextApiResponse } from "next";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatRequestBody = {
  messages: ChatMessage[];
};

type ChatResponseBody = {
  reply: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ChatResponseBody | { error: string }>
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
    const body = req.body as ChatRequestBody;

    if (!body?.messages || !Array.isArray(body.messages)) {
      return res.status(400).json({ error: "Invalid messages" });
    }

    const apiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // small + cheap, good for chat
        messages: body.messages,
      }),
    });

    if (!apiRes.ok) {
      const errorText = await apiRes.text();
      console.error("OpenAI error:", errorText);
      return res.status(500).json({ error: "OpenAI API error" });
    }

    const data = await apiRes.json();

    const reply =
      data?.choices?.[0]?.message?.content ??
      "Sorry, I couldn't generate a reply.";

    return res.status(200).json({ reply });
  } catch (err) {
    console.error("AI chat error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
