// src/pages/api/contracts/secure-sign.ts
import type { NextApiRequest, NextApiResponse } from "next";
import supabaseAdmin from "@/lib/supabaseAdmin";

const TERMS_VERSION = "v1.2"; // keep in sync with documents.tsx

type ContractStatus = "draft" | "signed" | "approved" | "cancelled";
type TankOption = "buy" | "rent";

type SignContractBody = {
  option: TankOption;
  // company & contacts
  company_name?: string;
  company_number?: string;
  vat_number?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  // addresses
  reg_address_line1?: string;
  reg_address_line2?: string;
  reg_city?: string;
  reg_postcode?: string;
  reg_country?: string;
  site_address_line1?: string;
  site_address_line2?: string;
  site_city?: string;
  site_postcode?: string;
  site_country?: string;
  // ROI
  tank_size_l?: number | null;
  monthly_consumption_l?: number | null;
  market_price_gbp_l?: number | null;
  fuelflow_price_gbp_l?: number | null;
  capex_gbp?: number | null;
  // signature
  signature_name: string;
  signer_title?: string;
  has_authority: boolean;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // 1) Get auth token from Authorization: Bearer <token>
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: "Missing auth token" });
    }

    // 2) Look up user from token using admin client
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData?.user?.email) {
      return res.status(401).json({ error: "Invalid or expired session" });
    }

    const emailLower = userData.user.email.toLowerCase();
    const body = req.body as SignContractBody;

    // 3) Validate signature + authority + option
    if (!body.signature_name || !body.signature_name.trim()) {
      return res.status(400).json({ error: "Missing signature" });
    }

    if (!body.has_authority) {
      return res.status(400).json({ error: "You must confirm you are authorised to sign." });
    }

    if (body.option !== "buy" && body.option !== "rent") {
      return res.status(400).json({ error: "Invalid tank option." });
    }

    // 4) Confirm they accepted the latest Terms
    const { data: ta, error: taError } = await supabaseAdmin
      .from("terms_acceptances")
      .select("id, accepted_at")
      .eq("email", emailLower)
      .eq("version", TERMS_VERSION)
      .order("accepted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (taError) {
      console.error("Error loading terms_acceptances", taError);
      return res.status(500).json({ error: "Failed to verify Terms acceptance." });
    }

    if (!ta?.id) {
      return res
        .status(400)
        .json({ error: "Please accept the latest Terms before signing the contract." });
    }

    const now = new Date().toISOString();
    const status: ContractStatus = body.option === "buy" ? "approved" : "signed";
    const approved_at = body.option === "buy" ? now : null;

    const derivedCustomerName =
      (body.company_name || "").trim() ||
      (body.contact_name || "").trim() ||
      (body.signature_name || "").trim();

    // 5) Capture IP + User-Agent for audit
    const ipHeader = (req.headers["x-forwarded-for"] as string) || "";
    const signed_ip = ipHeader.split(",")[0]?.trim() || (req.socket.remoteAddress ?? null);
    const signed_user_agent = (req.headers["user-agent"] as string) || null;

    // 6) Cancel previous approved contracts for same email+option (safety)
    await supabaseAdmin
      .from("contracts")
      .update({ status: "cancelled" })
      .eq("email", emailLower)
      .eq("tank_option", body.option)
      .eq("status", "approved");

    // 7) Insert the new contract row
    const payload = {
      email: emailLower,
      tank_option: body.option,
      status,
      signed_at: now,
      approved_at,
      customer_name: derivedCustomerName,

      company_name: body.company_name || null,
      company_number: body.company_number || null,
      vat_number: body.vat_number || null,

      contact_name: body.contact_name || null,
      contact_email: body.contact_email || emailLower,
      contact_phone: body.contact_phone || null,

      reg_address_line1: body.reg_address_line1 || null,
      reg_address_line2: body.reg_address_line2 || null,
      reg_city: body.reg_city || null,
      reg_postcode: body.reg_postcode || null,
      reg_country: body.reg_country || "UK",

      site_address_line1: body.site_address_line1 || null,
      site_address_line2: body.site_address_line2 || null,
      site_city: body.site_city || null,
      site_postcode: body.site_postcode || null,
      site_country: body.site_country || "UK",

      tank_size_l: body.tank_size_l ?? null,
      monthly_consumption_l: body.monthly_consumption_l ?? null,
      market_price_gbp_l: body.market_price_gbp_l ?? null,
      fuelflow_price_gbp_l: body.fuelflow_price_gbp_l ?? null,
      capex_gbp: body.capex_gbp ?? null,

      signature_name: body.signature_name.trim(),
      signer_title: body.signer_title || null,
      has_authority: body.has_authority,

      terms_acceptance_id: ta.id,
      signed_ip,
      signed_user_agent,
    };

    const { error: insertError } = await supabaseAdmin.from("contracts").insert([payload]);
    if (insertError) {
      console.error("Error inserting contract", insertError);
      return res.status(500).json({ error: "Failed to save contract." });
    }

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("Unexpected error in /api/contracts/secure-sign", err);
    return res.status(500).json({ error: "Unexpected error." });
  }
}
