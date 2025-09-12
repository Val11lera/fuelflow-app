// @ts-nocheck
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ ok: true, message: "Password reset handled on the client." });
}

export function GET() {
  return new Response("Method not allowed", { status: 405 });
}
