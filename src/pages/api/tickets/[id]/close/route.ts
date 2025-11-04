import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });

  // must be signed in
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // simple admin check (expects a table 'admins' with email text)
  const { data: admin } = await supabase
    .from("admins")
    .select("email")
    .eq("email", email)
    .maybeSingle();

  if (!admin?.email) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // call the RPC to close and append a system note
  const { error } = await supabase.rpc("close_ticket", {
    p_ticket_id: params.id,
    p_by: email,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
