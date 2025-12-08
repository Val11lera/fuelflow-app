import { NextResponse } from "next/server";

export async function GET(req) {
  // basic security
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    // Call your existing sync endpoint
    const res = await fetch(`${process.env.PUBLIC_BASE_URL}/api/xero/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      }
    });

    const data = await res.json();
    return NextResponse.json({ ok: true, sync: data });
  } catch (err) {
    console.error("CRON ERROR:", err);
    return NextResponse.json({ ok: false, error: err.message });
  }
}
