// src/lib/contract-pdf.ts
// src/lib/contract-pdf.ts
import { PDFDocument, StandardFonts, rgb, PDFPage } from "pdf-lib";

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
  signedAtIso: string;
};

/* =========
   Company details from env
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
  const marginX = 50;
  const bottomMargin = 80; // keep space for footer
  const firstPageHeaderHeight = 120;

  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pages: PDFPage[] = [];
  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  pages.push(page);

  const signedDate = new Date(data.signedAtIso);

  /* ===========
     Header (logo + centred title)
     =========== */

  // Logo (top-left)
  const logoUrl = "https://dashboard.fuelflow.co.uk/logo-email.png";
  try {
    const logoRes = await fetch(logoUrl);
    if (logoRes.ok) {
      const logoBytes = await logoRes.arrayBuffer();
      const logoImage = await pdfDoc.embedPng(logoBytes);
      const maxLogoWidth = 110;
      const scale = maxLogoWidth / logoImage.width;
      const logoDims = logoImage.scale(scale);

      const logoX = marginX;
      const logoY = pageHeight - marginX - logoDims.height + 15;

      page.drawImage(logoImage, {
        x: logoX,
        y: logoY,
        width: logoDims.width,
        height: logoDims.height,
      });
    }
  } catch {
    // ignore logo failures
  }

  // Title centred
  const titleText = `${COMPANY_NAME} Contract`;
  const titleSize = 18;
  const titleWidth = fontBold.widthOfTextAtSize(titleText, titleSize);
  const titleX = (pageWidth - titleWidth) / 2;
  const titleY = pageHeight - marginX - 25;

  page.drawText(titleText, {
    x: titleX,
    y: titleY,
    size: titleSize,
    font: fontBold,
    color: rgb(0.05, 0.05, 0.1),
  });

  const subtitle = `Signed on ${signedDate.toLocaleDateString(
    "en-GB"
  )} by ${fmt(data.signatureName)}`;
  const subtitleSize = 10;
  const subtitleWidth = fontRegular.widthOfTextAtSize(subtitle, subtitleSize);
  const subtitleX = (pageWidth - subtitleWidth) / 2;

  page.drawText(subtitle, {
    x: subtitleX,
    y: titleY - 18,
    size: subtitleSize,
    font: fontRegular,
    color: rgb(0.3, 0.3, 0.35),
  });

  // Thin separator under header
  page.drawLine({
    start: { x: marginX, y: pageHeight - marginX - 52 },
    end: { x: pageWidth - marginX, y: pageHeight - marginX - 52 },
    thickness: 0.7,
    color: rgb(0.8, 0.8, 0.85),
  });

  // Content Y start on first page
  let y = pageHeight - marginX - firstPageHeaderHeight;

  const sectionTitleSize = 12;
  const labelSize = 9;
  const valueSize = 11;

  const labelX = marginX;
  const valueX = marginX + 170;
  const rowGap = 16;

  // For subsequent pages: top position and "continued" label
  const continuedTopY = pageHeight - marginX - 40;

  function startNewPage() {
    page = pdfDoc.addPage([pageWidth, pageHeight]);
    pages.push(page);

    // small "continued" label
    page.drawText(`${COMPANY_NAME} Contract (continued)`, {
      x: marginX,
      y: pageHeight - marginX - 20,
      size: 10,
      font: fontRegular,
      color: rgb(0.4, 0.4, 0.45),
    });

    y = continuedTopY;
  }

  function ensureSpace(rows: number = 1) {
    const needed = rows * rowGap + 20;
    if (y - needed < bottomMargin) {
      startNewPage();
    }
  }

  function drawSection(title: string, note?: string, minBlockHeight?: number) {
    const rowsNeeded = minBlockHeight ? Math.ceil(minBlockHeight / rowGap) : 2;
    ensureSpace(rowsNeeded);

    const hasNote = !!note;
    const boxHeight = hasNote ? 32 : 22;

    page.drawRectangle({
      x: marginX,
      y: y - 6,
      width: pageWidth - marginX * 2,
      height: boxHeight,
      color: rgb(0.95, 0.96, 0.98),
    });

    page.drawText(title, {
      x: marginX + 8,
      y,
      size: sectionTitleSize,
      font: fontBold,
      color: rgb(0.15, 0.18, 0.25),
    });

    if (hasNote && note) {
      page.drawText(note, {
        x: marginX + 8,
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
     5. Tank & ROI – indicative
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
  // Force enough room so the entire signature block stays on the same page
  drawSection("6. Signature & declaration", undefined, 120);

  drawRow("Signed by", fmt(data.signatureName));
  drawRow("Job title", fmt(data.jobTitle));

  // "Signed date" + line + caption – keep together
  ensureSpace(3);

  page.drawText("Signed date", {
    x: labelX,
    y,
    size: labelSize,
    font: fontRegular,
    color: rgb(0.35, 0.35, 0.4),
  });

  page.drawText(signedDate.toLocaleDateString("en-GB"), {
    x: valueX,
    y,
    size: valueSize,
    font: fontRegular,
    color: rgb(0.05, 0.05, 0.12),
  });

  const sigLineY = y - 18;

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
     Footer – legal disclaimer + company details on last page only
     =========== */

  const lastPage = pages[pages.length - 1];
  let footerY = bottomMargin - 10;
  const footerFontSize = 8;
  const footerWidth = pageWidth - marginX * 2;

  function drawWrappedLinesOn(p: PDFPage, text: string, startY: number): number {
    const words = text.split(" ");
    let line = "";
    let yPos = startY;

    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      const testWidth = fontRegular.widthOfTextAtSize(testLine, footerFontSize);
      if (testWidth > footerWidth) {
        p.drawText(line, {
          x: marginX,
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
      p.drawText(line, {
        x: marginX,
        y: yPos,
        size: footerFontSize,
        font: fontRegular,
        color: rgb(0.35, 0.35, 0.4),
      });
      yPos -= 12;
    }

    return yPos;
  }

  // Option A disclaimer, with your company name
  const legal1 =
    "All pricing and ROI calculations in this document are estimates only. They do not constitute financial advice, projections, or guarantees.";
  const legal2 =
    "Final pricing may vary due to market changes, supply conditions and taxation. " +
    `${COMPANY_NAME} makes no assurance of future fuel savings and encourages customers to verify calculations independently.`;

  footerY = drawWrappedLinesOn(lastPage, legal1, footerY);
  footerY = drawWrappedLinesOn(lastPage, legal2, footerY - 2);

  // Company lines
  const companyLines: string[] = [];

  if (COMPANY_NAME) companyLines.push(COMPANY_NAME);
  if (COMPANY_NUMBER) companyLines.push(`Company No. ${COMPANY_NUMBER}`);
  if (COMPANY_VAT_NUMBER) companyLines.push(`VAT No. ${COMPANY_VAT_NUMBER}`);

  const addressLines =
    COMPANY_ADDRESS
      .split(/\\n|\n/)
      .map((l) => l.trim())
      .filter(Boolean) || [];

  companyLines.push(...addressLines);

  const contactBits: string[] = [];
  if (COMPANY_EMAIL) contactBits.push(COMPANY_EMAIL);
  if (COMPANY_PHONE) contactBits.push(COMPANY_PHONE);
  if (contactBits.length) companyLines.push(contactBits.join(" · "));

  if (companyLines.length) {
    footerY -= 4;
    for (const line of companyLines) {
      lastPage.drawText(line, {
        x: marginX,
        y: footerY,
        size: footerFontSize,
        font: fontRegular,
        color: rgb(0.3, 0.3, 0.35),
      });
      footerY -= 10;
    }
  }

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}
