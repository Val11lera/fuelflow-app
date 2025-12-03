// src/lib/contract-pdf.ts
// src/lib/contract-pdf.ts
// Generates the customer-facing FuelFlow contract PDF.

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type ContractForPdf = {
  // Identity / meta
  contractId: string;
  signedAtIso: string | null;
  signerName: string | null;
  signerTitle: string | null;
  tankOption: "buy" | "rent" | null;

  // 1. Company details
  companyName: string | null;
  companyNumber: string | null;
  vatNumber: string | null;

  // 2. Primary contact
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;

  // 3. Registered / billing address
  regAddressLine1: string | null;
  regAddressLine2: string | null;
  regCity: string | null;
  regPostcode: string | null;
  regCountry: string | null;

  // 4. Site / delivery address
  siteAddressLine1: string | null;
  siteAddressLine2: string | null;
  siteCity: string | null;
  sitePostcode: string | null;
  siteCountry: string | null;

  // 5. Tank & ROI – kept as optional so we can safely include them later
  tankSizeL?: number | null;
  monthlyConsumptionL?: number | null;
  marketPriceGbpL?: number | null;
  fuelflowPriceGbpL?: number | null;
  estMonthlySavingsGbp?: number | null;
  estPaybackMonths?: number | null;
};


// ----- env / company details -----

const COMPANY_NAME =
  process.env.COMPANY_NAME || "FuelFlow";

const COMPANY_NUMBER =
  process.env.COMPANY_NUMBER || "12345678";

const COMPANY_VAT_NUMBER =
  process.env.COMPANY_VAT_NUMBER || "GB123456789";

const COMPANY_ADDRESS =
  process.env.COMPANY_ADDRESS ||
  "1 Example Street, Example Town, EX1 2MP, United Kingdom";

const COMPANY_EMAIL =
  process.env.COMPANY_EMAIL || "invoices@mail.fuelflow.co.uk";

const COMPANY_PHONE =
  process.env.COMPANY_PHONE || "+44 (0)20 1234 5678";

// Signed URL logo is handled elsewhere – for the contract we embed from public path.
const LOGO_URL =
  process.env.NEXT_PUBLIC_CONTRACT_LOGO_URL ||
  "https://dashboard.fuelflow.co.uk/logo-email.png";

// ----- helpers -----

const gbDate = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB");
};

const safe = (v?: string | null) => (v && v.trim().length ? v.trim() : "—");

type DrawFieldRowArgs = {
  label: string;
  value: string;
  page: any;
  font: any;
  xLabel: number;
  xValue: number;
  y: number;
  lineHeight: number;
};

function drawFieldRow({
  label,
  value,
  page,
  font,
  xLabel,
  xValue,
  y,
  lineHeight,
}: DrawFieldRowArgs) {
  page.drawText(label, {
    x: xLabel,
    y,
    size: 9,
    font,
    color: rgb(0.38, 0.4, 0.46),
  });
  page.drawText(value, {
    x: xValue,
    y,
    size: 10,
    font,
    color: rgb(0.07, 0.08, 0.12),
  });
}

async function fetchLogoBytes(): Promise<Uint8Array | null> {
  try {
    if (!LOGO_URL) return null;
    const res = await fetch(LOGO_URL);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

// ----- main export -----

export async function generateContractPdf(
  contract: ContractForPdf
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4 portrait

  const width = page.getWidth();
  const height = page.getHeight();

  const marginX = 56;
  const contentWidth = width - marginX * 2;

  const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let cursorY = height - 72;

  // ---- header: logo + title ----
  const logoBytes = await fetchLogoBytes();
  if (logoBytes) {
    try {
      const png = await pdf.embedPng(logoBytes);
      const logoW = 80;
      const logoH = (png.height / png.width) * logoW;

      page.drawImage(png, {
        x: marginX,
        y: cursorY - logoH + 10,
        width: logoW,
        height: logoH,
      });
    } catch {
      // ignore logo errors
    }
  }

 const title = "FuelFlow Contract";
const signedBy =
  contract.signerName && contract.signerName.trim().length
    ? contract.signerName.trim()
    : "authorised signatory";


  const signedOn =
    contract.signed_at || new Date().toISOString();

  const subTitle = `Signed on ${gbDate(
    signedOn
  )} by ${signedBy.toLowerCase()}`;

  page.drawText(title, {
    x: marginX + 120,
    y: cursorY,
    size: 18,
    font: fontBold,
    color: rgb(0.07, 0.08, 0.12),
  });

  page.drawText(subTitle, {
    x: marginX + 120,
    y: cursorY - 18,
    size: 9,
    font: fontRegular,
    color: rgb(0.25, 0.27, 0.35),
  });

  // thin divider under title
  page.drawLine({
    start: { x: marginX, y: cursorY - 32 },
    end: { x: marginX + contentWidth, y: cursorY - 32 },
    thickness: 0.7,
    color: rgb(0.85, 0.87, 0.93),
  });

  cursorY -= 56;

  const sectionHeaderHeight = 20;
  const sectionHeaderColor = rgb(0.95, 0.97, 1);
  const sectionHeaderTextColor = rgb(0.07, 0.08, 0.12);

  const xLabel = marginX + 18;
  const xValue = marginX + 180;
  const lineGap = 16;

  const drawSectionHeader = (label: string) => {
    page.drawRectangle({
      x: marginX,
      y: cursorY - sectionHeaderHeight,
      width: contentWidth,
      height: sectionHeaderHeight,
      color: sectionHeaderColor,
    });

    page.drawText(label, {
      x: marginX + 8,
      y: cursorY - sectionHeaderHeight + 6,
      size: 10,
      font: fontBold,
      color: sectionHeaderTextColor,
    });

    cursorY -= sectionHeaderHeight + 14;
  };

  const companyName =
    safe(contract.company_name) ||
    safe(contract.customer_name);

  // ---- 1. Company details ----
  drawSectionHeader("1. Company details");

  drawFieldRow({
    label: "Company name",
    value: companyName,
    page,
    font: fontRegular,
    xLabel,
    xValue,
    y: cursorY,
    lineHeight: lineGap,
  });

  cursorY -= lineGap;

  drawFieldRow({
    label: "Company number",
    value: safe(contract.company_number),
    page,
    font: fontRegular,
    xLabel,
    xValue,
    y: cursorY,
    lineHeight: lineGap,
  });

  cursorY -= lineGap;

  drawFieldRow({
    label: "VAT number",
    value: safe(contract.vat_number),
    page,
    font: fontRegular,
    xLabel,
    xValue,
    y: cursorY,
    lineHeight: lineGap,
  });

  cursorY -= lineGap + 10;

  // ---- 2. Primary contact ----
  drawSectionHeader("2. Primary contact");

  drawFieldRow({
    label: "Name",
    value: safe(contract.contact_name || contract.customer_name),
    page,
    font: fontRegular,
    xLabel,
    xValue,
    y: cursorY,
    lineHeight: lineGap,
  });
  cursorY -= lineGap;

  drawFieldRow({
    label: "Email",
    value: safe(contract.contact_email || contract.email),
    page,
    font: fontRegular,
    xLabel,
    xValue,
    y: cursorY,
    lineHeight: lineGap,
  });
  cursorY -= lineGap;

  drawFieldRow({
    label: "Phone",
    value: safe(contract.contact_phone),
    page,
    font: fontRegular,
    xLabel,
    xValue,
    y: cursorY,
    lineHeight: lineGap,
  });
  cursorY -= lineGap + 10;

  // ---- 3. Registered / billing address ----
  drawSectionHeader("3. Registered / billing address");

  const regAddress =
    safe(contract.reg_address_line1) !== "—"
      ? `${safe(contract.reg_address_line1)}${
          safe(contract.reg_address_line2) !== "—"
            ? `, ${safe(contract.reg_address_line2)}`
            : ""
        }`
      : safe(contract.reg_address_line2);

  drawFieldRow({
    label: "Address",
    value: regAddress,
    page,
    font: fontRegular,
    xLabel,
    xValue,
    y: cursorY,
    lineHeight: lineGap,
  });
  cursorY -= lineGap;

  drawFieldRow({
    label: "City",
    value: safe(contract.reg_city),
    page,
    font: fontRegular,
    xLabel,
    xValue,
    y: cursorY,
    lineHeight: lineGap,
  });
  cursorY -= lineGap;

  drawFieldRow({
    label: "Postcode",
    value: safe(contract.reg_postcode),
    page,
    font: fontRegular,
    xLabel,
    xValue,
    y: cursorY,
    lineHeight: lineGap,
  });
  cursorY -= lineGap;

  drawFieldRow({
    label: "Country",
    value: safe(contract.reg_country || "UK"),
    page,
    font: fontRegular,
    xLabel,
    xValue,
    y: cursorY,
    lineHeight: lineGap,
  });
  cursorY -= lineGap + 10;

  // ---- 4. Site / delivery address ----
  drawSectionHeader("4. Site / delivery address");

  const siteAddress =
    safe(contract.site_address_line1) !== "—"
      ? `${safe(contract.site_address_line1)}${
          safe(contract.site_address_line2) !== "—"
            ? `, ${safe(contract.site_address_line2)}`
            : ""
        }`
      : safe(contract.site_address_line2);

  drawFieldRow({
    label: "Address",
    value: siteAddress,
    page,
    font: fontRegular,
    xLabel,
    xValue,
    y: cursorY,
    lineHeight: lineGap,
  });
  cursorY -= lineGap;

  drawFieldRow({
    label: "City",
    value: safe(contract.site_city),
    page,
    font: fontRegular,
    xLabel,
    xValue,
    y: cursorY,
    lineHeight: lineGap,
  });
  cursorY -= lineGap;

  drawFieldRow({
    label: "Postcode",
    value: safe(contract.site_postcode),
    page,
    font: fontRegular,
    xLabel,
    xValue,
    y: cursorY,
    lineHeight: lineGap,
  });
  cursorY -= lineGap;

  drawFieldRow({
    label: "Country",
    value: safe(contract.site_country || "UK"),
    page,
    font: fontRegular,
    xLabel,
    xValue,
    y: cursorY,
    lineHeight: lineGap,
  });
  cursorY -= lineGap + 10;

  // ---- 5. Signature & declaration ----
  drawSectionHeader("5. Signature & declaration");

  drawFieldRow({
    label: "Signed by",
    value: safe(contract.signature_name),
    page,
    font: fontRegular,
    xLabel,
    xValue,
    y: cursorY,
    lineHeight: lineGap,
  });
  cursorY -= lineGap;

  drawFieldRow({
    label: "Job title",
    value: safe(contract.signer_title),
    page,
    font: fontRegular,
    xLabel,
    xValue,
    y: cursorY,
    lineHeight: lineGap,
  });
  cursorY -= lineGap;

  drawFieldRow({
    label: "Signed date",
    value: gbDate(contract.signed_at),
    page,
    font: fontRegular,
    xLabel,
    xValue,
    y: cursorY,
    lineHeight: lineGap,
  });
  cursorY -= lineGap + 10;

  // signature line
  page.drawLine({
    start: { x: xValue, y: cursorY },
    end: { x: xValue + 180, y: cursorY },
    thickness: 0.7,
    color: rgb(0.2, 0.22, 0.28),
  });

  cursorY -= 18;

  page.drawText(
    `Authorised signatory: ${safe(contract.signature_name)}`,
    {
      x: xLabel,
      y: cursorY,
      size: 9,
      font: fontRegular,
      color: rgb(0.2, 0.22, 0.28),
    }
  );

  // ---- footer text ----
  const footerTopY = 110;

  // divider above footer
  page.drawLine({
    start: { x: marginX, y: footerTopY + 46 },
    end: { x: marginX + contentWidth, y: footerTopY + 46 },
    thickness: 0.5,
    color: rgb(0.85, 0.87, 0.93),
  });

  const footerTextColor = rgb(0.35, 0.37, 0.43);

  const footerLines: string[] = [
    "This contract forms part of the FuelFlow Terms & Conditions accepted via the FuelFlow online portal. If there is any inconsistency, the Terms & Conditions will take precedence.",
    "All pricing and ROI information relating to this contract is indicative only, does not constitute financial, tax or investment advice, and may change due to market conditions, supply and taxation. FuelFlow does not guarantee any particular level of savings or future fuel prices.",
  ];

  let footerY = footerTopY + 32;
  const footerFontSize = 7.5;

  for (const line of footerLines) {
    page.drawText(line, {
      x: marginX,
      y: footerY,
      size: footerFontSize,
      font: fontRegular,
      color: footerTextColor,
    });
    footerY -= 11;
  }

  // company line centred near bottom
  const companyLine = `${COMPANY_NAME} · Company No. ${COMPANY_NUMBER} · VAT No. ${COMPANY_VAT_NUMBER} · ${COMPANY_ADDRESS} · ${COMPANY_EMAIL} · ${COMPANY_PHONE}`;

  const textWidth = fontRegular.widthOfTextAtSize(
    companyLine,
    footerFontSize
  );

  page.drawText(companyLine, {
    x: (width - textWidth) / 2,
    y: 60,
    size: footerFontSize,
    font: fontRegular,
    color: footerTextColor,
  });

  const bytes = await pdf.save();
  return bytes;
}
