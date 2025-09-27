// /src/middleware.ts
import { NextResponse, NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Never intercept API routes or static assets
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    /\.(png|jpg|jpeg|svg|gif|ico|css|js|map)$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/|_next/|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|ico|css|js|map)$).*)"],
};


