// app/api/cron/xero-sync/route.js
// app/api/cron/xero-sync/route.js

import { NextResponse } from "next/server";

// This route is called by:
// 1) Vercel Cron (with Authorization: Bearer <CRON_SECRET> header)
// 2) You manually in the browser: /api/cron/xero-sync?secret=CRON_SECRET

export async function GET(req) {
  // Figure out our own base URL from the request
  // e.g. https://fuelflow-app.vercel.app
  const url = new URL(req.url);
  const origin = url.origin;

  // 1) Secret from the Authorization header (used by Vercel Cron)
  const authHeader = req.headers.get("authorization");
  const expectedHeader = `Bearer ${process.env.CRON_SECRET}`;

  // 2) Secret from the query string (used by you in the browser)
  const secretFromQuery = url.searchParams.get("secret");
  const expectedSecret = process.env.CRON_SECRET;

  const headerOk = authHeader === expectedHeader;
  const queryOk = secretFromQuery && secretFromQuery === expectedSecret;

  // If neither header nor query secret is correct -> block
  if (!headerOk && !queryOk) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    // Call your existing Xero sync endpoint on the SAME deployment
    const res = await fetch(`${origin}/api/xero/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = await res.json();

    return NextResponse.json(
      { ok: res.ok, sync: data },
      { status: res.status }
    );
  } catch (err) {
    console.error("CRON ERROR:", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}

