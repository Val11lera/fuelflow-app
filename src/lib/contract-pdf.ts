// src/lib/contract-pdf.ts
// src/lib/contract-pdf.ts
// FuelFlow contract PDF – 1-page, legally-worded layout.

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/* ------------------------------------------------------------------
   Types – match the columns on public.contracts that we actually use
   ------------------------------------------------------------------ */

export type ContractForPdf = {
  id: string;

  // high-level
  email: string | null;
  customer_name: string | null;

  // company details
  company_name: string | null;
  company_number: string | null;
  vat_number: string | null;

  // primary contact
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;

  // registered / billing address
  reg_address_line1: string | null;
  reg_address_line2: string | null;
  reg_city: string | null;
  reg_postcode: string | null;
  reg_country: string | null;

  // site / delivery address
  site_address_line1: string | null;
  site_address_line2: string | null;
  site_city: string | null;
  site_postcode: string | null;
  site_country: string | null;

  // sign-off
  signature_name: string | null;
  signer_title: string | null;
  signed_at: string | null; // ISO date from DB

  // not currently printed, but kept for future:
  tank_option?: "buy" | "rent" | null;
  tank_size_l?: number | null;
  monthly_consumption_l?: number | null;
  market_price_gbp_l?: number | null;
  fuelflow_price_gbp_l?: number | null;
  capex_gbp?: number | null;
};

/* ------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------ */

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

function fmtMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return gbp.format(Number(n));
}

function gbDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB");
}

function safe(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  return s.length ? s : "—";
}

/* ------------------------------------------------------------------
   Main: createContractPdf
   ------------------------------------------------------------------ */

export async function createContractPdf(contract: ContractForPdf): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage();

  const { width, height } = page.getSize();
  const marginX = 60;
  let y = height - 60;

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // -------- Logo + title -------------------------------------------------

  try {
    const logoUrl = "https://dashboard.fuelflow.co.uk/logo-email.png";
    const logoBytes = await fetch(logoUrl).then((r) => r.arrayBuffer());
    const logoImage = await pdfDoc.embedPng(logoBytes);
    const logoWidth = 110;
    const logoHeight = (logoImage.height / logoImage.width) * logoWidth;

    page.drawImage(logoImage, {
      x: marginX,
      y: y - logoHeight,
      width: logoWidth,
      height: logoHeight,
    });
  } catch {
    // if logo fails, just skip – don't break PDF
  }

  // Title block
  const title = "FuelFlow Contract";
  const signedOn =
    contract.signed_at || new Date().toISOString();
  const signedByLine = `Signed on ${gbDate(signedOn)} by ${
    safe(contract.signature_name).toLowerCase()
  }`;

  page.drawText(title, {
    x: marginX,
    y: y - 20,
    size: 18,
    font: fontBold,
    color: rgb(0.11, 0.15, 0.25),
  });

  page.drawText(signedByLine, {
    x: marginX,
    y: y - 38,
    size: 10,
    font: fontRegular,
    color: rgb(0.25, 0.25, 0.25),
  });

  // divider line
  y = y - 52;
  page.drawLine({
    start: { x: marginX, y },
    end: { x: width - marginX, y },
    thickness: 0.7,
    color: rgb(0.8, 0.82, 0.9),
  });
  y -= 26;

  // -------- helpers for sections ----------------------------------------

  const headerFill = rgb(0.95, 0.97, 1);
  const headerText = rgb(0.1, 0.14, 0.24);
  const labelColor = rgb(0.35, 0.35, 0.4);
  const valueColor = rgb(0.08, 0.09, 0.12);

  function sectionHeader(title: string) {
    const h = 20;
    page.drawRectangle({
      x: marginX,
      y: y - h + 4,
      width: width - marginX * 2,
      height: h,
      color: headerFill,
    });
    page.drawText(title, {
      x: marginX + 16,
      y: y,
      size: 11,
      font: fontBold,
      color: headerText,
    });
    y -= h + 10;
  }

  function fieldRow(label: string, value: string) {
    const rowHeight = 14;
    page.drawText(label, {
      x: marginX,
      y,
      size: 9,
      font: fontRegular,
      color: labelColor,
    });
    page.drawText(value, {
      x: marginX + 120,
      y,
      size: 10,
      font: fontRegular,
      color: valueColor,
    });
    y -= rowHeight;
  }

  // -------- 1. Company details ------------------------------------------

  sectionHeader("1. Company details");
  fieldRow("Company name", safe(contract.company_name));
  fieldRow("Company number", safe(contract.company_number));
  fieldRow("VAT number", safe(contract.vat_number));
  y -= 8;

  // -------- 2. Primary contact -----------------------------------------

  sectionHeader("2. Primary contact");
  fieldRow("Name", safe(contract.contact_name));
  fieldRow("Email", safe(contract.contact_email));
  fieldRow("Phone", safe(contract.contact_phone));
  y -= 8;

  // -------- 3. Registered / billing address -----------------------------

  sectionHeader("3. Registered / billing address");
  fieldRow("Address", safe(contract.reg_address_line1));
  fieldRow("City", safe(contract.reg_city));
  fieldRow("Postcode", safe(contract.reg_postcode));
  fieldRow("Country", safe(contract.reg_country || "UK"));
  y -= 8;

  // -------- 4. Site / delivery address ----------------------------------

  sectionHeader("4. Site / delivery address");
  fieldRow("Address", safe(contract.site_address_line1));
  fieldRow("City", safe(contract.site_city));
  fieldRow("Postcode", safe(contract.site_postcode));
  fieldRow("Country", safe(contract.site_country || "UK"));
  y -= 8;

  // -------- 5. Signature & declaration ----------------------------------

  sectionHeader("5. Signature & declaration");

  fieldRow("Signed by", safe(contract.signature_name));
  fieldRow("Job title", safe(contract.signer_title));
  fieldRow("Signed date", gbDate(contract.signed_at));

  // signature line
  y -= 10;
  page.drawLine({
    start: { x: marginX, y },
    end: { x: marginX + 220, y },
    thickness: 0.7,
    color: rgb(0.2, 0.2, 0.25),
  });
  y -= 14;
  page.drawText(
    `Authorised signatory: ${safe(contract.signature_name).toLowerCase()}`,
    {
      x: marginX,
      y,
      size: 9,
      font: fontRegular,
      color: valueColor,
    }
  );

  // -------- Footer legal text & company details -------------------------

  const footerTop = 110;
  const footerMargin = 70;
  const legalSize = 8;
  const legalColor = rgb(0.3, 0.3, 0.35);

  const legalLines = [
    "This contract forms part of the FuelFlow Terms & Conditions accepted via the FuelFlow online portal. If there is any inconsistency, the Terms",
    "& Conditions will take precedence.",
    "All pricing and ROI information relating to this contract is indicative only, does not constitute financial, tax or investment advice, and may",
    "change due to market conditions, supply and taxation. FuelFlow does not guarantee any particular level of savings or future fuel prices.",
  ];

  let ly = footerTop;
  for (const line of legalLines) {
    page.drawText(line, {
      x: footerMargin,
      y: ly,
      size: legalSize,
      font: fontRegular,
      color: legalColor,
    });
    ly -= 11;
  }

  const companyLine =
    "FuelFlow · Company No. 12345678 · VAT No. GB123456789 · 1 Example Street, Example Town, EX1 2MP, United Kingdom · invoices@mail.fuelflow.co.uk · +44 (0)20 1234 5678";

  page.drawText(companyLine, {
    x: footerMargin,
    y: ly - 6,
    size: legalSize,
    font: fontRegular,
    color: legalColor,
  });

  // ----------------------------------------------------------------------

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}
