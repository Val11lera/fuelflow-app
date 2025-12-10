// app/api/cron/xero-sync/route.js
// app/api/cron/xero-sync/route.js

import { NextResponse } from "next/server";

// Called by:
//  - Vercel Cron (with Authorization: Bearer <CRON_SECRET> header)
//  - You manually: /api/cron/xero-sync?secret=CRON_SECRET

export async function GET(req) {
  const url = new URL(req.url);
  const origin = url.origin;

  // 1) Secret from header (Vercel Cron)
  const authHeader = req.headers.get("authorization");
  const expectedHeader = `Bearer ${process.env.CRON_SECRET}`;

  // 2) Secret from query (manual test)
  const secretFromQuery = url.searchParams.get("secret");
  const expectedSecret = process.env.CRON_SECRET;

  const headerOk = authHeader === expectedHeader;
  const queryOk = secretFromQuery && secretFromQuery === expectedSecret;

  if (!headerOk && !queryOk) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    // Call your existing Xero sync endpoint on the SAME deployment
    const res = await fetch(`${origin}/api/xero/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Do NOT assume JSON – read raw text first
    const raw = await res.text();
    let parsed;

    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      // Not JSON – just return the raw text
      parsed = raw;
    }

    return NextResponse.json(
      {
        ok: res.ok,
        status: res.status,
        body: parsed,
      },
      { status: res.ok ? 200 : res.status || 500 }
    );
  } catch (err) {
    console.error("CRON ERROR:", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
