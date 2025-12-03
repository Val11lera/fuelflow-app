// src/lib/contract-pdf.ts
// src/lib/contract-pdf.ts
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type ContractForPdf = {
  // Company details
  companyName: string;
  companyNumber: string;
  vatNumber: string | null;

  // Primary contact
  primaryName: string;
  primaryEmail: string;
  primaryPhone: string;

  // Registered / billing address
  regAddress1: string;
  regAddress2: string | null;
  regCity: string;
  regPostcode: string;
  regCountry: string;

  // Site / delivery address
  siteAddress1: string;
  siteAddress2: string | null;
  siteCity: string;
  sitePostcode: string;
  siteCountry: string;

  // Tank & ROI
  tankSizeL: number;
  monthlyConsumptionL: number;
  marketPricePerL: number;
  fuelflowPricePerL: number;
  capexGbp: number | null;
  estMonthlySavingsGbp: number | null;
  estPaybackText: string | null;

  // Signature
  signatureName: string;
  jobTitle: string;
  signedAtIso: string; // e.g. new Date().toISOString()
};

/* =========
   Env-based company details (footer)
   ========= */

const COMPANY_NAME = process.env.COMPANY_NAME || "FuelFlow";
const COMPANY_ADDRESS = process.env.COMPANY_ADDRESS || "";
const COMPANY_EMAIL = process.env.COMPANY_EMAIL || "";
const COMPANY_PHONE = process.env.COMPANY_PHONE || "";
const COMPANY_VAT_NUMBER = process.env.COMPANY_VAT_NUMBER || "";
const COMPANY_NUMBER = process.env.COMPANY_NUMBER || "";

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

function fmtMoney(v: number | null | undefined) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return GBP.format(v);
}

function fmt(v: string | null | undefined) {
  return v && v.trim() ? v.trim() : "—";
}

export async function generateContractPdf(data: ContractForPdf): Promise<Uint8Array> {
  const pageWidth = 595; // A4
  const pageHeight = 842;
  const margin = 50;

  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  // ===========
  // Header with logo
  // ===========
  const logoUrl = "https://dashboard.fuelflow.co.uk/logo-email.png";

  try {
    const logoRes = await fetch(logoUrl);
    if (logoRes.ok) {
      const logoBytes = await logoRes.arrayBuffer();
      const logoImage = await pdfDoc.embedPng(logoBytes);
      const maxLogoWidth = 120;
      const scale = maxLogoWidth / logoImage.width;
      const logoDims = logoImage.scale(scale);

      const logoX = margin;
      const logoY = pageHeight - margin - logoDims.height + 10;

      page.drawImage(logoImage, {
        x: logoX,
        y: logoY,
        width: logoDims.width,
        height: logoDims.height,
      });
    }
  } catch {
    // if logo fails, continue with text-only header
  }

  const signedDate = new Date(data.signedAtIso);

  page.drawText(`${COMPANY_NAME} Contract`, {
    x: margin + 160,
    y: pageHeight - margin - 10,
    size: 18,
    font: fontBold,
    color: rgb(0.05, 0.05, 0.1),
  });

  page.drawText(
    `Signed on ${signedDate.toLocaleDateString("en-GB")} by ${fmt(data.signatureName)}`,
    {
      x: margin + 160,
      y: pageHeight - margin - 30,
      size: 10,
      font: fontRegular,
      color: rgb(0.25, 0.25, 0.3),
    }
  );

  // Separator line
  page.drawLine({
    start: { x: margin, y: pageHeight - margin - 50 },
    end: { x: pageWidth - margin, y: pageHeight - margin - 50 },
    thickness: 0.7,
    color: rgb(0.8, 0.8, 0.85),
  });

  y = pageHeight - margin - 70;

  const sectionTitleSize = 12;
  const labelSize = 9;
  const valueSize = 11;

  const labelX = margin;
  const valueX = margin + 170;
  const rowGap = 16;

  function ensureSpace(rows: number = 1) {
    const needed = rows * rowGap + 60;
    if (y - needed < margin + 60) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;

      page.drawText(`${COMPANY_NAME} Contract (continued)`, {
        x: margin,
        y,
        size: 10,
        font: fontRegular,
        color: rgb(0.4, 0.4, 0.45),
      });

      y -= 24;
    }
  }

  function drawSection(title: string, note?: string) {
    ensureSpace(2);
    // soft strip background
    page.drawRectangle({
      x: margin,
      y: y - 6,
      width: pageWidth - margin * 2,
      height: note ? 32 : 22,
      color: rgb(0.95, 0.96, 0.98),
    });

    page.drawText(title, {
      x: margin + 8,
      y,
      size: sectionTitleSize,
      font: fontBold,
      color: rgb(0.15, 0.18, 0.25),
    });

    if (note) {
      page.drawText(note, {
        x: margin + 8,
        y: y - 16,
        size: 8,
        font: fontRegular,
        color: rgb(0.45, 0.45, 0.5),
      });
      y -= 34;
    } else {
      y -= 28;
    }
  }

  function drawRow(label: string, value: string) {
    ensureSpace(1);

    page.drawText(label, {
      x: labelX,
      y,
      size: labelSize,
      font: fontRegular,
      color: rgb(0.35, 0.35, 0.4),
    });

    page.drawText(value, {
      x: valueX,
      y,
      size: valueSize,
      font: fontRegular,
      color: rgb(0.05, 0.05, 0.12),
    });

    y -= rowGap;
  }

  /* ================
     1. Company details
     ================ */
  drawSection("1. Company details");
  drawRow("Company name", fmt(data.companyName));
  drawRow("Company number", fmt(data.companyNumber));
  drawRow("VAT number", fmt(data.vatNumber));

  /* ================
     2. Primary contact
     ================ */
  drawSection("2. Primary contact");
  drawRow("Name", fmt(data.primaryName));
  drawRow("Email", fmt(data.primaryEmail));
  drawRow("Phone", fmt(data.primaryPhone));

  /* ===========================
     3. Registered / billing address
     =========================== */
  drawSection("3. Registered / billing address");
  const regAddressCombined = `${fmt(data.regAddress1)}${
    data.regAddress2 ? ", " + fmt(data.regAddress2) : ""
  }`;
  drawRow("Address", regAddressCombined);
  drawRow("City", fmt(data.regCity));
  drawRow("Postcode", fmt(data.regPostcode));
  drawRow("Country", fmt(data.regCountry));

  /* ======================
     4. Site / delivery address
     ====================== */
  drawSection("4. Site / delivery address");
  const siteAddressCombined = `${fmt(data.siteAddress1)}${
    data.siteAddress2 ? ", " + fmt(data.siteAddress2) : ""
  }`;
  drawRow("Address", siteAddressCombined);
  drawRow("City", fmt(data.siteCity));
  drawRow("Postcode", fmt(data.sitePostcode));
  drawRow("Country", fmt(data.siteCountry));

  /* ===========
     5. Tank & ROI (estimates)
     =========== */
  drawSection(
    "5. Tank & ROI – indicative figures",
    "All pricing and ROI figures in this section are non-binding estimates based on the usage and pricing information provided."
  );

  drawRow("Tank size (L)", `${data.tankSizeL.toLocaleString("en-GB")} L`);
  drawRow(
    "Estimated monthly consumption (L)",
    `${data.monthlyConsumptionL.toLocaleString("en-GB")} L`
  );
  drawRow("Indicative market price (£/L)", `£${data.marketPricePerL.toFixed(2)}`);
  drawRow(
    "Indicative FuelFlow price (£/L)",
    `£${data.fuelflowPricePerL.toFixed(2)}`
  );
  drawRow("Estimated capex (£)", fmtMoney(data.capexGbp ?? null));
  drawRow(
    "Estimated monthly savings",
    fmtMoney(data.estMonthlySavingsGbp ?? null)
  );
  drawRow("Indicative payback period", fmt(data.estPaybackText));

  /* ===========
     6. Signature & declaration
     =========== */
  drawSection("6. Signature & declaration");
  drawRow("Signed by", fmt(data.signatureName));
  drawRow("Job title", fmt(data.jobTitle));
  drawRow("Signed date", signedDate.toLocaleDateString("en-GB"));

  ensureSpace(3);

  // Signature line
  const sigLineY = y - 10;
  page.drawLine({
    start: { x: labelX, y: sigLineY },
    end: { x: labelX + 220, y: sigLineY },
    thickness: 0.8,
    color: rgb(0.2, 0.2, 0.25),
  });
  page.drawText("Authorised signatory", {
    x: labelX,
    y: sigLineY - 12,
    size: 9,
    font: fontRegular,
    color: rgb(0.25, 0.25, 0.3),
  });

  /* ===========
     Footer – legal + company details (Option A)
     =========== */

  const footerTextLines: string[] = [];

  // Option A disclaimer, but with dynamic company name
  footerTextLines.push(
    "All pricing and ROI calculations in this document are estimates only. They do not constitute financial advice, projections, or guarantees."
  );
  footerTextLines.push(
    "Final pricing may vary due to market changes, supply conditions and taxation. " +
      `${COMPANY_NAME} makes no assurance of future fuel savings and encourages customers to verify calculations independently.`
  );

  const footerCompanyLines: string[] = [];
  if (COMPANY_NAME) footerCompanyLines.push(COMPANY_NAME);
  if (COMPANY_NUMBER)
    footerCompanyLines.push(`Company No. ${COMPANY_NUMBER}`);
  if (COMPANY_VAT_NUMBER)
    footerCompanyLines.push(`VAT No. ${COMPANY_VAT_NUMBER}`);
  if (COMPANY_ADDRESS) footerCompanyLines.push(COMPANY_ADDRESS);
  const contactBits: string[] = [];
  if (COMPANY_EMAIL) contactBits.push(COMPANY_EMAIL);
  if (COMPANY_PHONE) contactBits.push(COMPANY_PHONE);
  if (contactBits.length) footerCompanyLines.push(contactBits.join(" · "));

  const footerFontSize = 8;
  const footerWidth = pageWidth - margin * 2;
  const footerBottomMargin = 24;

  function drawWrappedLines(text: string, startY: number): number {
    const words = text.split(" ");
    let line = "";
    let yPos = startY;

    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      const testWidth = fontRegular.widthOfTextAtSize(testLine, footerFontSize);
      if (testWidth > footerWidth) {
        page.drawText(line, {
          x: margin,
          y: yPos,
          size: footerFontSize,
          font: fontRegular,
          color: rgb(0.35, 0.35, 0.4),
        });
        yPos -= 10;
        line = word;
      } else {
        line = testLine;
      }
    }

    if (line) {
      page.drawText(line, {
        x: margin,
        y: yPos,
        size: footerFontSize,
        font: fontRegular,
        color: rgb(0.35, 0.35, 0.4),
      });
      yPos -= 12;
    }

    return yPos;
  }

  // Draw legal disclaimer at very bottom of last page
  let footerY = margin + footerBottomMargin + 14;

  footerTextLines.forEach((t) => {
    footerY = drawWrappedLines(t, footerY);
  });

  if (footerCompanyLines.length) {
    footerY -= 4;
    footerCompanyLines.forEach((t) => {
      page.drawText(t, {
        x: margin,
        y: footerY,
        size: footerFontSize,
        font: fontRegular,
        color: rgb(0.3, 0.3, 0.35),
      });
      footerY -= 10;
    });
  }

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}

