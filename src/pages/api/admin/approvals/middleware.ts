// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";

// All routes that normal customers are allowed to use when APPROVED only
const PROTECTED = [
  "/client-dashboard",
  "/order",
  "/documents",
  "/account",
];

export async function middleware(req: NextRequest) {
  const url = req.nextUrl;

  // Only guard protected routes
  if (!PROTECTED.some((p) => url.pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Create a response we can mutate (required by auth-helpers)
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  // 1) Require a session (signed-in)
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    const login = new URL("/login", url);
    login.searchParams.set("redirect", url.pathname);
    return NextResponse.redirect(login);
  }

  const email = (session.user.email || "").toLowerCase();

  // 2) Check approval
  // Prefer the admin view if you created it; if not present, fall back to tables.
  let isApproved = false;

  // Try the view first (status === 'approved')
  const { data: vrow, error: vErr } = await supabase
    .from("admin_customers_v")
    .select("status")
    .eq("email", email)
    .maybeSingle();

  if (!vErr && vrow?.status === "approved") {
    isApproved = true;
  } else {
    // Fallback: allowlist entry exists AND not in blocked_users
    const [{ data: allow }, { data: block }] = await Promise.all([
      supabase.from("email_allowlist").select("email").eq("email", email).maybeSingle(),
      supabase.from("blocked_users").select("email").eq("email", email).maybeSingle(),
    ]);
    isApproved = !!allow && !block;
  }

  if (!isApproved) {
    // Sign out and send to /blocked
    try {
      await supabase.auth.signOut();
    } catch {}
    const blocked = new URL("/blocked", url);
    return NextResponse.redirect(blocked);
  }

  return res;
}

// Tell Next.js which paths run through this middleware
export const config = {
  matcher: [
    "/client-dashboard",
    "/order",
    "/documents",
    "/account",
  ],
};
