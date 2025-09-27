// /src/middleware.ts
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
  "/api", // protect your API routes if desired
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // only run on protected routes
  if (!PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const res = NextResponse.next();

  // Supabase SSR client bound to request/response cookies
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

  // 1) Need a logged-in user
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
  const { data: blocked } = await supabase
    .from("blocked_users")
    .select("email")
    .eq("email", email)
    .maybeSingle();

  if (blocked?.email) {
    const url = req.nextUrl.clone();
    url.pathname = "/blocked";
    url.searchParams.set("email", email);
    return NextResponse.redirect(url, { headers: res.headers });
  }

  // 3) Approved (allow-list) check
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

  return res;
}

export const config = {
  matcher: [
    "/client-dashboard",
    "/order",
    "/documents",
    "/api/:path*",
  ],
};
