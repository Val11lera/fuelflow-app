// app/api/cron/xero-sync/route.js
// app/api/cron/xero-sync/route.js
import { NextResponse } from "next/server";

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const secret = url.searchParams.get("secret");

    // 1) Cron auth (protects this endpoint)
    if (!process.env.CRON_SECRET) {
      console.error("CRON_SECRET is not set");
      return NextResponse.json(
        { ok: false, error: "server-misconfigured (no CRON_SECRET)" },
        { status: 500 }
      );
    }

    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    // 2) Base URL
    if (!process.env.PUBLIC_BASE_URL) {
      console.error("PUBLIC_BASE_URL is not set");
      return NextResponse.json(
        { ok: false, error: "server-misconfigured (no PUBLIC_BASE_URL)" },
        { status: 500 }
      );
    }

    // 3) Protect sync endpoint too (recommended)
    // Set XERO_SYNC_SECRET in Vercel, and sync-pending should verify it.
    const syncSecret = process.env.XERO_SYNC_SECRET;
    if (!syncSecret) {
      console.error("XERO_SYNC_SECRET is not set");
      return NextResponse.json(
        { ok: false, error: "server-misconfigured (no XERO_SYNC_SECRET)" },
        { status: 500 }
      );
    }

    const targetUrl = `${process.env.PUBLIC_BASE_URL}/api/xero/sync-pending?secret=${encodeURIComponent(
      syncSecret
    )}`;

    console.log("Cron calling:", targetUrl.replace(syncSecret, "***"));

    const res = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // avoid caching issues on Vercel/edge
      cache: "no-store",
    });

    const text = await res.text();
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }

    return NextResponse.json(
      { ok: res.ok, status: res.status, body },
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
