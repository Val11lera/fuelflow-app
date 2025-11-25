// src/components/OrderAIChat.tsx
// src/components/OrderAIChat.tsx
// src/components/OrderAIChat.tsx
// src/components/OrderAIChat.tsx
"use client";

import React, { useMemo, useRef, useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

type Role = "user" | "assistant";

type LocalMessage = {
  id: string;
  role: Role;
  content: string;
};

type OrderSummary = {
  id: string;
  created_at: string;
  fuel: string | null;
  litres: number | null;
  amount_gbp: number;
  fulfilment_status: string | null;
};

type Props = {
  orders: OrderSummary[];
  userEmail: string;
};

function formatOrderLabel(o: OrderSummary) {
  const date = new Date(o.created_at).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
  const amount = o.amount_gbp.toFixed(2);
  return `${date} • ${o.fuel ?? "Fuel"} • ${o.litres ?? "?"}L • £${amount}`;
}

// Browser Supabase client (anon key)
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

export const OrderAIChat: React.FC<Props> = ({ orders, userEmail }) => {
  const [selectedOrderId, setSelectedOrderId] = useState<string | "">("");
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Only show last 8–10 orders in dropdown
  const recentOrders = useMemo(() => orders.slice(0, 10), [orders]);

  // Load saved history for a specific order + user from ai_order_messages table / view
  async function loadOrderHistory(orderId: string) {
    if (!supabase || !userEmail) {
      setMessages([]);
      return;
    }

    setLoadingHistory(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from("ai_order_messages")
        .select("id, created_at, sender_type, message_text, status")
        .eq("order_id", orderId)
        .eq("user_email", userEmail)
        // Only show history if the conversation is not marked as handled/closed
        // (status is NULL or anything except 'handled_by_admin')
        .or("status.is.null,status.neq.handled_by_admin")
        .order("created_at", { ascending: true });

      if (error) throw error;

      const mapped: LocalMessage[] = (data || []).map((row: any) => ({
        id: row.id,
        role: row.sender_type === "customer" ? "user" : "assistant",
        content: row.message_text || "",
      }));

      setMessages(mapped);
    } catch (e: any) {
      console.error("Failed to load order chat history:", e);
      setError(e?.message || "Failed to load previous messages");
      setMessages([]);
    } finally {
      setLoadingHistory(false);
    }
  }

  // Whenever the selected order changes:
  // - if no order => general question => clear history
  // - if order selected => load full history from Supabase
  useEffect(() => {
    if (!selectedOrderId) {
      setMessages([]);
      return;
    }
    loadOrderHistory(selectedOrderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrderId, userEmail]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isSending) return;

    const newUserMessage: LocalMessage = {
      id: String(Date.now()),
      role: "user",
      content: input.trim(),
    };

    const nextMessages = [...messages, newUserMessage];

    setMessages(nextMessages);
    setInput("");
    setIsSending(true);
    setError(null);

    try {
      const res = await fetch("/api/ai-order-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: selectedOrderId || null,
          userEmail: userEmail || null,
          messages: nextMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || "Something went wrong");
      }

      const data = (await res.json()) as { reply: string };

      const assistantMsg: LocalMessage = {
        id: String(Date.now() + 1),
        role: "assistant",
        content: data.reply,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to send message");
    } finally {
      setIsSending(false);
    }
  }

  const selectedOrder = selectedOrderId
    ? recentOrders.find((o) => o.id === selectedOrderId)
    : null;

  return (
    <div className="flex h-[60vh] max-h-[70vh] flex-col rounded-2xl border border-white/10 bg-[#020617]/95 shadow-lg backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-white/5 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-yellow-500/90 text-xs font-bold text-[#041F3E]">
            ?
          </span>
          <div>
            <div className="text-xs font-semibold text-white">
              Need help?
            </div>
            <div className="text-[11px] text-white/60">
              Ask about your orders, deliveries or invoices. Our assistant
              replies instantly and our team can follow up if needed.
            </div>
          </div>
        </div>
      </div>

      {/* Order selector */}
      <div className="border-b border-white/5 px-3 py-2">
        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-white/60">
          Order context (optional)
        </label>
        <select
          value={selectedOrderId}
          onChange={(e) => setSelectedOrderId(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white focus:border-yellow-500 focus:outline-none"
        >
          <option value="">
            💬 General question – not about a specific order
          </option>
          {recentOrders.map((o) => (
            <option key={o.id} value={o.id}>
              {formatOrderLabel(o)}
            </option>
          ))}
        </select>
        {selectedOrder && (
          <div className="mt-1 text-[11px] text-white/50">
            Linked to order{" "}
            <span className="font-mono">{selectedOrder.id}</span>
          </div>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 space-y-2 overflow-y-auto px-3 py-2 text-sm"
      >
        {loadingHistory && (
          <div className="rounded-xl border border-dashed border-white/15 bg-white/5 px-3 py-3 text-[12px] leading-relaxed text-white/60">
            Loading previous messages…
          </div>
        )}

        {!loadingHistory && messages.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/15 bg-white/5 px-3 py-3 text-[12px] leading-relaxed text-white/60">
            Start a conversation with our support assistant.
            <ul className="mt-1 list-disc space-y-1 pl-4">
              <li>“Where is my latest delivery?”</li>
              <li>“Summarise the status of my last 3 orders.”</li>
              <li>“Draft a polite message to ask about a delay.”</li>
            </ul>
            <p className="mt-2 text-[11px] text-white/45">
              If you need a person to step in, just say so and a team member
              can review this thread.
            </p>
          </div>
        )}

        {!loadingHistory &&
          messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${
                m.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                  m.role === "user"
                    ? "bg-yellow-500 text-[#041F3E]"
                    : "bg-white/8 text-white"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
      </div>

      {/* Error */}
      {error && (
        <div className="px-3 pb-1 text-[11px] text-rose-300">{error}</div>
      )}

      {/* Input */}
      <form onSubmit={handleSend} className="border-t border-white/10 px-3 py-2">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={2}
            placeholder={
              selectedOrder
                ? "Ask a question about this order…"
                : "Ask a question about your account or orders…"
            }
            className="max-h-32 flex-1 resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder:text-white/40 focus:border-yellow-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={isSending || !input.trim()}
            className={`inline-flex h-9 min-w-[70px] items-center justify-center rounded-xl px-3 text-xs font-semibold ${
              isSending || !input.trim()
                ? "cursor-not-allowed bg-white/10 text-white/30"
                : "bg-yellow-500 text-[#041F3E] hover:bg-yellow-400"
            }`}
          >
            {isSending ? "…" : "Send"}
          </button>
        </div>
        <div className="mt-1 text-[10px] text-white/40">
          Messages may be reviewed by our team to help resolve your query.
          Linked questions are saved with the order.
        </div>
      </form>
    </div>
  );
};

