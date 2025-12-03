// src/pages/api/contracts/[id]/pdf.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { generateContractPdf, ContractForPdf } from "@/lib/contract-pdf";

/**
 * IMPORTANT:
 * - SUPABASE_SERVICE_ROLE_KEY must be set in your Vercel env (server-side only).
 * - Do NOT expose this key in the browser.
 */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

// Type matching your SQL comments (only the fields we actually use)
type ContractRow = {
  id: string;
  email: string | null;
  customer_name: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postcode: string | null;
  tank_option: "buy" | "rent" | string;
  tank_size_l: number | null;
  monthly_consumption_l: number | null;
  market_price_gbp_l: number | null;
  fuelflow_price_gbp_l: number | null;
  est_monthly_savings_gbp: number | null;
  est_payback_months: number | null;
  terms_version: string | null;
  signature_name: string | null;
  signed_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  cheaper_by_gbp_l: number | null;
  capex_required_gbp: number | null;
  signer_title: string | null;
  has_authority: boolean | null;
  signed_ip: string | null;
  signed_user_agent: string | null;
  extra: any | null; // jsonb – used for extra form fields (company no, VAT, phone, etc.)
};

function safeText(v: unknown): string | null {
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  return null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { id } = req.query;
  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "Missing contract id" });
  }

  // Load the contract row
  const { data, error } = await supabase
    .from("contracts")
    .select("*")
    .eq("id", id)
    .single<ContractRow>();

  if (error || !data) {
    console.error("Contract not found or error:", error);
    return res.status(404).json({ error: "Contract not found" });
  }

  // ----- Pull extras from jsonb if present -----
  const extra = (data.extra || {}) as Record<string, any>;

  // Adjust the keys below if your form stores them differently in extra.jsonb
  const companyName =
    safeText(extra.company_name) ||
    safeText(extra.company) ||
    safeText(data.customer_name) ||
    "—";

  const companyNumber =
    safeText(extra.company_number) ||
    safeText(extra.company_no) ||
    "—";

  const vatNumber =
    safeText(extra.vat_number) ||
    safeText(extra.vat) ||
    null;

  const primaryName =
    safeText(extra.primary_contact_name) ||
    safeText(extra.contact_name) ||
    safeText(data.customer_name) ||
    "—";

  const primaryEmail =
    safeText(extra.primary_contact_email) ||
    safeText(data.email) ||
    "—";

  const primaryPhone =
    safeText(extra.primary_contact_phone) ||
    safeText(extra.phone) ||
    "—";

  // If you later split registered vs site addresses, update here.
  const regAddress1 = safeText(extra.reg_address_line1) || safeText(data.address_line1) || "—";
  const regAddress2 = safeText(extra.reg_address_line2) || safeText(data.address_line2);
  const regCity = safeText(extra.reg_city) || safeText(data.city) || "—";
  const regPostcode = safeText(extra.reg_postcode) || safeText(data.postcode) || "—";
  const regCountry = safeText(extra.reg_country) || "UK";

  const siteAddress1 = safeText(extra.site_address_line1) || safeText(data.address_line1) || "—";
  const siteAddress2 = safeText(extra.site_address_line2) || safeText(data.address_line2);
  const siteCity = safeText(extra.site_city) || safeText(data.city) || "—";
  const sitePostcode = safeText(extra.site_postcode) || safeText(data.postcode) || "—";
  const siteCountry = safeText(extra.site_country) || "UK";

  // Est payback as friendly text
  let estPaybackText: string | null = null;
  if (data.est_payback_months != null) {
    const months = Number(data.est_payback_months);
    if (!Number.isNaN(months) && months > 0) {
      estPaybackText =
        months === 1 ? "1 month" : `${months.toFixed(0)} months`;
    }
  }

  const signedAtIso =
    data.signed_at ||
    new Date().toISOString();

  const contractForPdf: ContractForPdf = {
    // Company details
    companyName,
    companyNumber,
    vatNumber,

    // Primary contact
    primaryName,
    primaryEmail,
    primaryPhone,

    // Registered / billing address
    regAddress1,
    regAddress2: regAddress2 || null,
    regCity,
    regPostcode,
    regCountry,

    // Site / delivery address
    siteAddress1,
    siteAddress2: siteAddress2 || null,
    siteCity,
    sitePostcode,
    siteCountry,

    // Tank & ROI
    tankSizeL: Number(data.tank_size_l || 0),
    monthlyConsumptionL: Number(data.monthly_consumption_l || 0),
    marketPricePerL: Number(data.market_price_gbp_l || 0),
    fuelflowPricePerL: Number(data.fuelflow_price_gbp_l || 0),
    capexGbp:
      data.capex_required_gbp != null
        ? Number(data.capex_required_gbp)
        : null,
    estMonthlySavingsGbp:
      data.est_monthly_savings_gbp != null
        ? Number(data.est_monthly_savings_gbp)
        : null,
    estPaybackText,

    // Signature
    signatureName: data.signature_name || "—",
    jobTitle: data.signer_title || "—",
    signedAtIso,
  };

  const pdfBytes = await generateContractPdf(contractForPdf);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="fuelflow-contract-${id}.pdf"`
  );

  // Node can send a Buffer directly
  res.status(200).send(Buffer.from(pdfBytes));
}
