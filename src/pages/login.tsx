// src/pages/login.tsx
// src/pages/login.tsx
"use client";

import React, { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
      if (error) throw error;
      window.location.href = "/client-dashboard";
    } catch (e: any) {
      setErr(e?.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0b1220] text-white">
      <div className="max-w-xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-semibold mb-4">Client Login</h1>

        <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <label className="block text-sm">
            <span className="mb-1 block text-white/70">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/[0.06] p-2 text-sm"
              required
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-white/70">Password</span>
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/[0.06] p-2 text-sm"
              required
            />
          </label>

          {err && (
            <div className="rounded-md border border-rose-400/30 bg-rose-500/10 p-2 text-sm text-rose-200">
              {err}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-yellow-500 py-2 font-semibold text-[#041F3E] hover:bg-yellow-400 disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}



