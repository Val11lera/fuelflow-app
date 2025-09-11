// src/pages/update-password.tsx
"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/router";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

type Msg = { type: "error" | "success" | "info"; text: string };

export default function UpdatePassword() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    // After clicking the email link, Supabase creates a temporary session.
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session);
    });
  }, []);

  async function handleUpdate() {
    try {
      setLoading(true);
      setMsg(null);

      if (!pw || pw.length < 8) {
        setMsg({ type: "error", text: "Password must be at least 8 characters." });
        return;
      }
      if (pw !== pw2) {
        setMsg({ type: "error", text: "Passwords don’t match." });
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) {
        setMsg({ type: "error", text: "Update failed: " + error.message });
        return;
      }

      setMsg({ type: "success", text: "Password updated. Redirecting to login…" });
      setTimeout(() => router.push("/login"), 1500);
    } catch (e: any) {
      setMsg({ type: "error", text: e?.message || "Unexpected error." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0b1220] text-white">
      <div className="mx-auto max-w-md px-4 py-10">
        <h1 className="text-2xl font-semibold mb-4">Set a new password</h1>

        {hasSession === false && (
          <div className="mb-4 rounded-lg border border-rose-400/40 bg-rose-500/10 p-3 text-rose-200">
            This link is invalid or expired. Please request a new reset email from the login page.
          </div>
        )}

        <label className="block text-sm mb-3">
          <span className="mb-1 block text-white/80">New password</span>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/[0.06] p-2 text-sm"
          />
        </label>

        <label className="block text-sm mb-4">
          <span className="mb-1 block text-white/80">Confirm new password</span>
          <input
            type="password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/[0.06] p-2 text-sm"
          />
        </label>

        <button
          onClick={handleUpdate}
          disabled={loading || hasSession === false}
          className="w-full rounded-lg bg-yellow-500 py-2 font-semibold text-[#041F3E] hover:bg-yellow-400 disabled:opacity-60"
        >
          {loading ? "Updating…" : "Update password"}
        </button>

        {msg && (
          <div
            className={[
              "mt-4 rounded-lg border p-2 text-sm",
              msg.type === "error"
                ? "border-rose-400/40 bg-rose-500/10 text-rose-200"
                : msg.type === "success"
                ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                : "border-white/15 bg-white/5 text-white/80",
            ].join(" ")}
          >
            {msg.text}
          </div>
        )}
      </div>
    </div>
  );
}
