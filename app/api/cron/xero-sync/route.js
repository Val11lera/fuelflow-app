// app/api/cron/xero-sync/route.js
// app/api/cron/xero-sync/route.js

import { NextResponse } from "next/server";

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const secret = url.searchParams.get("secret");

    // 1) Check we have a CRON_SECRET configured
    if (!process.env.CRON_SECRET) {
      console.error("CRON_SECRET is not set in Vercel env vars");
      return NextResponse.json(
        { ok: false, error: "server-misconfigured (no CRON_SECRET)" },
        { status: 500 }
      );
    }

    // 2) Very simple auth – query param must match CRON_SECRET
    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 }
      );
    }

    // 3) We will call the *existing* Xero sync endpoint in your app
    if (!process.env.PUBLIC_BASE_URL) {
      console.error("PUBLIC_BASE_URL is not set in Vercel env vars");
      return NextResponse.json(
        { ok: false, error: "server-misconfigured (no PUBLIC_BASE_URL)" },
        { status: 500 }
      );
    }

    // IMPORTANT: this is the internal API that actually does the sync
    // If your real path is different, change just this line.
    const targetUrl = `${process.env.PUBLIC_BASE_URL}/api/xero/sync-pending`;

    console.log("Cron calling:", targetUrl);

    const res = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Try to parse JSON, but also survive if it is plain text
    const text = await res.text();
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }

    return NextResponse.json(
      {
        ok: res.ok,
        status: res.status,
        body,
      },
      { status: res.ok ? 200 : 500 }
    );
  } catch (err) {
    console.error("CRON ERROR:", err);
    return NextResponse.json(
      { ok: false, error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
