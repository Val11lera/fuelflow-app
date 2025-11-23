// src/components/AIChat.tsx
"use client";

import React, { useState } from "react";

type Role = "user" | "assistant";

type LocalMessage = {
  id: number;
  role: Role;
  content: string;
};

export const AIChat: React.FC = () => {
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isSending) return;

    const newMessage: LocalMessage = {
      id: Date.now(),
      role: "user",
      content: input.trim(),
    };

    const newMessagesList = [...messages, newMessage];

    setMessages(newMessagesList);
    setInput("");
    setIsSending(true);
    setError(null);

    try {
      // Prepare messages for the API (add a system prompt + map local messages)
      const apiMessages = [
        {
          role: "system" as const,
          content:
            "You are an AI assistant inside the FuelFlow admin/client dashboard. Help with fuel orders, support tickets, invoices and general questions.",
        },
        ...newMessagesList.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      ];

      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages: apiMessages }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || "Something went wrong");
      }

      const data = (await res.json()) as { reply: string };

      const assistantMessage: LocalMessage = {
        id: Date.now() + 1,
        role: "assistant",
        content: data.reply,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to send message");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: "12px",
        padding: "12px",
        maxWidth: "400px",
        display: "flex",
        flexDirection: "column",
        height: "450px",
        background: "#ffffff",
      }}
    >
      <div
        style={{
          fontWeight: 600,
          marginBottom: "8px",
          fontSize: "14px",
        }}
      >
        💬 Chat with AI
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "8px",
          marginBottom: "8px",
          borderRadius: "8px",
          background: "#f9fafb",
          border: "1px solid #e5e7eb",
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              fontSize: "13px",
              color: "#6b7280",
            }}
          >
            Ask anything, for example:
            <ul style={{ marginTop: "4px", paddingLeft: "20px" }}>
              <li>“Summarise today’s support ticket notes.”</li>
              <li>“Explain how our commission works.”</li>
              <li>“Draft a reply to a customer.”</li>
            </ul>
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              marginBottom: "6px",
              textAlign: m.role === "user" ? "right" : "left",
            }}
          >
            <div
              style={{
                display: "inline-block",
                padding: "6px 10px",
                borderRadius: "999px",
                fontSize: "13px",
                background:
                  m.role === "user"
                    ? "#2563eb"
                    : "#e5e7eb",
                color: m.role === "user" ? "#ffffff" : "#111827",
              }}
            >
              {m.content}
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div
          style={{
            color: "#b91c1c",
            fontSize: "12px",
            marginBottom: "4px",
          }}
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSend} style={{ display: "flex", gap: "6px" }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={2}
          placeholder="Type your question..."
          style={{
            flex: 1,
            resize: "none",
            fontSize: "13px",
            padding: "6px 8px",
            borderRadius: "8px",
            border: "1px solid #d1d5db",
          }}
        />
        <button
          type="submit"
          disabled={isSending || !input.trim()}
          style={{
            minWidth: "70px",
            borderRadius: "8px",
            border: "none",
            padding: "0 10px",
            fontSize: "13px",
            fontWeight: 600,
            cursor: isSending || !input.trim() ? "not-allowed" : "pointer",
            opacity: isSending || !input.trim() ? 0.6 : 1,
          }}
        >
          {isSending ? "..." : "Send"}
        </button>
      </form>
    </div>
  );
};
