// src/pages/api/contracts/[id]/pdf.ts
// src/pages/api/contracts/[id]/pdf.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { generateContractPdf, ContractForPdf } from "@/lib/contract-pdf";

// Admin Supabase client (server-side)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

type ContractRow = {
  id: string;

  // company
  company_name: string | null;
  company_number: string | null;
  vat_number: string | null;

  // primary contact
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;

  // registered / billing
  reg_address_line1: string | null;
  reg_address_line2: string | null;
  reg_city: string | null;
  reg_postcode: string | null;
  reg_country: string | null;

  // site / delivery
  site_address_line1: string | null;
  site_address_line2: string | null;
  site_city: string | null;
  site_postcode: string | null;
  site_country: string | null;

  // ROI
  tank_size_l: number | null;
  monthly_consumption_l: number | null;
  market_price_gbp_l: number | null;
  fuelflow_price_gbp_l: number | null;
  capex_gbp: number | null;
  est_monthly_savings_gbp: number | null;
  est_payback_months: number | null;

  // signature
  signature_name: string | null;
  signer_title: string | null;
  signed_at: string | null;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end("Method Not Allowed");
  }

  const { id } = req.query;
  if (!id || Array.isArray(id)) {
    return res.status(400).json({ error: "Invalid contract id" });
  }

  // Load contract row from Supabase
  const { data, error } = await supabaseAdmin
    .from("contracts")
    .select("*")
    .eq("id", id)
    .maybeSingle<ContractRow>();

  if (error) {
    console.error("Error loading contract:", error);
    return res.status(500).json({ error: "Failed to load contract" });
  }

  if (!data) {
    return res.status(404).json({ error: "Contract not found" });
  }

  // Map DB row → ContractForPdf (camelCase)
  const contractForPdf: ContractForPdf = {
    // Company details
    companyName: data.company_name || "",
    companyNumber: data.company_number || "",
    vatNumber: data.vat_number || null,

    // Primary contact
    primaryName: data.contact_name || "",
    primaryEmail: data.contact_email || "",
    primaryPhone: data.contact_phone || "",

    // Registered / billing address
    regAddress1: data.reg_address_line1 || "",
    regAddress2: data.reg_address_line2 || null,
    regCity: data.reg_city || "",
    regPostcode: data.reg_postcode || "",
    regCountry: data.reg_country || "UK",

    // Site / delivery address
    siteAddress1: data.site_address_line1 || "",
    siteAddress2: data.site_address_line2 || null,
    siteCity: data.site_city || "",
    sitePostcode: data.site_postcode || "",
    siteCountry: data.site_country || "UK",

    // Tank & ROI (kept for compatibility, not currently rendered)
    tankSizeL: Number(data.tank_size_l ?? 0),
    monthlyConsumptionL: Number(data.monthly_consumption_l ?? 0),
    marketPricePerL: Number(data.market_price_gbp_l ?? 0),
    fuelflowPricePerL: Number(data.fuelflow_price_gbp_l ?? 0),
    capexGbp:
      data.capex_gbp !== null && data.capex_gbp !== undefined
        ? Number(data.capex_gbp)
        : null,
    estMonthlySavingsGbp:
      data.est_monthly_savings_gbp !== null &&
      data.est_monthly_savings_gbp !== undefined
        ? Number(data.est_monthly_savings_gbp)
        : null,
    estPaybackText:
      data.est_payback_months !== null &&
      data.est_payback_months !== undefined
        ? `${data.est_payback_months} months`
        : null,

    // Signature
    signatureName: data.signature_name || "",
    jobTitle: data.signer_title || "",
    signedAtIso: data.signed_at || new Date().toISOString(),
  };

  // Generate PDF
  const pdfBytes = await generateContractPdf(contractForPdf);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="contract-${id}.pdf"`
  );
  return res.status(200).send(Buffer.from(pdfBytes));
}

