// src/pages/update-password.tsx
// src/pages/update-password.tsx
"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

export default function UpdatePassword() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Make sure any code in the URL is exchanged for a session (works for v2 links)
  useEffect(() => {
    (async () => {
      try {
        // If there's a code in the URL, this will set a temporary session
        await supabase.auth.exchangeCodeForSession(window.location.href).catch(() => {});
      } finally {
        setReady(true);
      }
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) {
      setMsg("Please enter a new password.");
      return;
    }
    try {
      setLoading(true);
      setMsg(null);
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setMsg(error.message);
        return;
      }
      setMsg("Password updated. You can now sign in with the new password.");
    } catch (err: any) {
      setMsg(err?.message || "Unexpected error.");
    } finally {
      setLoading(false);
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#0b1220] text-white grid place-items-center">
        <div>Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b1220] text-white grid place-items-center p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-xl border border-white/10 bg-white/5 p-5"
      >
        <h1 className="text-xl font-semibold mb-3">Set a new password</h1>
        <label className="block text-sm">
          <span className="mb-1 block text-white/80">New password</span>
          <input
            type="password"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none focus:ring focus:ring-yellow-500/30"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="mt-4 w-full rounded-lg bg-yellow-500 px-4 py-2 font-semibold text-[#041F3E] hover:bg-yellow-400 disabled:opacity-60"
        >
          {loading ? "Updating…" : "Update password"}
        </button>
        {msg && <div className="mt-3 text-sm text-white/80">{msg}</div>}
      </form>
    </div>
  );
}
