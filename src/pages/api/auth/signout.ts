// src/pages/api/auth/signout.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createServerClient } from "@supabase/ssr";
import * as cookie from "cookie";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => cookie.parse(req.headers.cookie ?? "")[name],
        set: (name: string, value: string, options: cookie.CookieSerializeOptions) => {
          const serialized = cookie.serialize(name, value, {
            ...options,
            domain: process.env.AUTH_COOKIE_DOMAIN || ".fuelflow.co.uk",
            path: "/",
            httpOnly: true,
            sameSite: "lax",
            secure: true,
          });
          const prev = res.getHeader("Set-Cookie");
          if (!prev) res.setHeader("Set-Cookie", serialized);
          else if (Array.isArray(prev)) res.setHeader("Set-Cookie", [...prev, serialized]);
          else res.setHeader("Set-Cookie", [prev as string, serialized]);
        },
        remove: (name: string, options: cookie.CookieSerializeOptions) => {
          const serialized = cookie.serialize(name, "", {
            ...options,
            domain: process.env.AUTH_COOKIE_DOMAIN || ".fuelflow.co.uk",
            path: "/",
            httpOnly: true,
            sameSite: "lax",
            secure: true,
            maxAge: 0,
          });
          const prev = res.getHeader("Set-Cookie");
          if (!prev) res.setHeader("Set-Cookie", serialized);
          else if (Array.isArray(prev)) res.setHeader("Set-Cookie", [...prev, serialized]);
          else res.setHeader("Set-Cookie", [prev as string, serialized]);
        },
      },
    }
  );

  await supabase.auth.signOut();
  res.status(200).json({ ok: true });
}
