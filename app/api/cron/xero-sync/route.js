// app/api/cron/xero-sync/route.js
// app/api/cron/xero-sync/route.js

import { NextResponse } from "next/server";

export async function GET(req) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");

  // 1) Simple auth – make sure the secret matches
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  // 2) Work out our own base URL
  const origin =
    process.env.PUBLIC_BASE_URL ??
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

  // 3) *** IMPORTANT: point this at your real Xero sync endpoint ***
  //    CHANGE "/api/xero-sync" if your real path is different!
  const targetUrl = `${origin}/api/xero-sync`;

  try {
    const res = await fetch(targetUrl, {
      method: "GET",
    });

    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text; // not JSON, just return raw text
    }

    return NextResponse.json(
      { ok: res.ok, status: res.status, body },
      { status: res.status }
    );
  } catch (err) {
    console.error("CRON ERROR calling Xero sync:", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
