// /src/middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

/**
 * Paths that require the user to be approved (and not blocked).
 * Adjust to your app’s protected routes.
 */
const PROTECTED = [
  "/client-dashboard",
  "/order",
  "/documents",
  "/api", // protect all /api/* you want to gate for clients
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // only run on protected routes
  if (!PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  // we will set cookies on the outgoing response when needed
  const res = NextResponse.next();

  // Supabase SSR client using cookies from the request/response
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          res.cookies.set(name, value, options);
        },
        remove(name: string, options: CookieOptions) {
          res.cookies.set(name, "", { ...options, maxAge: 0 });
        },
      },
    }
  );

  // 1) Require a session
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const email = (user.email || "").toLowerCase();

  // 2) Blocked check
  // (relies on RLS policies below that allow users to read their own row)
  const { data: blocked } = await supabase
    .from("blocked_users")
    .select("email")
    .eq("email", email)
    .maybeSingle();

  if (blocked?.email) {
    // Don’t let them in. Redirect to a friendly page.
    const url = req.nextUrl.clone();
    url.pathname = "/blocked";
    url.searchParams.set("email", email);
    return NextResponse.redirect(url, { headers: res.headers });
  }

  // 3) Allow-list (approved) check.
  //    If you consider “approved” = exists in email_allowlist
  const { data: allowed } = await supabase
    .from("email_allowlist")
    .select("email")
    .eq("email", email)
    .maybeSingle();

  if (!allowed?.email) {
    const url = req.nextUrl.clone();
    url.pathname = "/pending";
    url.searchParams.set("email", email);
    return NextResponse.redirect(url, { headers: res.headers });
  }

  // All good
  return res;
}

// Tell Next.js which paths the middleware should run on
export const config = {
  matcher: [
    "/client-dashboard",
    "/order",
    "/documents",
    "/api/:path*", // only if you want to protect API routes too
  ],
};
