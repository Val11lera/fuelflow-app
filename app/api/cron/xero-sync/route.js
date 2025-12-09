// app/api/cron/xero-sync/route.js
import { NextResponse } from "next/server";

export async function GET(req) {
  const url = new URL(req.url);

  const secretFromQuery = url.searchParams.get("secret");
  const authHeader = req.headers.get("authorization") || "";
  const expectedSecret = process.env.CRON_SECRET;

  // Basic protection: must send the CRON_SECRET either as ?secret=... or Bearer header
  if (
    !expectedSecret ||
    (secretFromQuery !== expectedSecret &&
      authHeader !== `Bearer ${expectedSecret}`)
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const baseUrl = process.env.PUBLIC_BASE_URL;
    if (!baseUrl) {
      throw new Error("PUBLIC_BASE_URL env var is missing");
    }

    // Call your existing Xero sync endpoint
    const res = await fetch(`${baseUrl}/api/xero/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = await res.json();

    return NextResponse.json({ ok: true, sync: data });
  } catch (err) {
    console.error("CRON ERROR:", err);
    return NextResponse.json({ ok: false, error: err.message });
  }
}
