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

  // Tank & ROI (kept in type for compatibility, but NOT rendered)
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

function fmt(v: string | null | undefined) {
  return v && v.trim() ? v.trim() : "—";
}

export async function generateContractPdf(data: ContractForPdf): Promise<Uint8Array> {
  const pageWidth = 595; // A4
  const pageHeight = 842;
  const marginX = 50;
  const topMargin = 60;
  const bottomMargin = 80; // keep space for footer

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([pageWidth, pageHeight]);

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const signedDate = new Date(data.signedAtIso);

  /* ===========
     Header (logo + centred title)
     =========== */

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
      const logoY = pageHeight - topMargin - logoDims.height + 20;

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

  const titleText = `${COMPANY_NAME} Contract`;
  const titleSize = 18;
  const titleWidth = fontBold.widthOfTextAtSize(titleText, titleSize);
  const titleX = (pageWidth - titleWidth) / 2;
  const titleY = pageHeight - topMargin - 25;

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

  // Separator under header
  page.drawLine({
    start: { x: marginX, y: pageHeight - topMargin - 52 },
    end: { x: pageWidth - marginX, y: pageHeight - topMargin - 52 },
    thickness: 0.7,
    color: rgb(0.8, 0.8, 0.85),
  });

  /* ===========
     Body – single page only
     =========== */

  let y = pageHeight - topMargin - 90; // starting Y for sections

  const sectionLabelSize = 11;
  const sectionHeaderHeight = 20;
  const sectionGap = 14;
  const rowLabelSize = 9;
  const rowValueSize = 11;
  const rowGap = 16;

  const labelX = marginX;
  const valueX = marginX + 170;

  function drawSection(title: string) {
    // small gap before section
    y -= sectionGap;

    // background strip
    page.drawRectangle({
      x: marginX,
      y: y - 4,
      width: pageWidth - marginX * 2,
      height: sectionHeaderHeight,
      color: rgb(0.95, 0.96, 0.98),
    });

    // section title – baseline a bit lower so no clipping
    page.drawText(title, {
      x: marginX + 8,
      y: y + 3,
      size: sectionLabelSize,
      font: fontBold,
      color: rgb(0.15, 0.18, 0.25),
    });

    // move Y to just below the header strip
    y -= sectionHeaderHeight + 6;
  }

  function drawRow(label: string, value: string) {
    page.drawText(label, {
      x: labelX,
      y,
      size: rowLabelSize,
      font: fontRegular,
      color: rgb(0.35, 0.35, 0.4),
    });

    page.drawText(value, {
      x: valueX,
      y,
      size: rowValueSize,
      font: fontRegular,
      color: rgb(0.05, 0.05, 0.12),
    });

    y -= rowGap;
  }

  /* 1. Company details */
  drawSection("1. Company details");
  drawRow("Company name", fmt(data.companyName));
  drawRow("Company number", fmt(data.companyNumber));
  drawRow("VAT number", fmt(data.vatNumber));

  /* 2. Primary contact */
  drawSection("2. Primary contact");
  drawRow("Name", fmt(data.primaryName));
  drawRow("Email", fmt(data.primaryEmail));
  drawRow("Phone", fmt(data.primaryPhone));

  /* 3. Registered / billing address */
  drawSection("3. Registered / billing address");
  const regAddressCombined = `${fmt(data.regAddress1)}${
    data.regAddress2 ? ", " + fmt(data.regAddress2) : ""
  }`;
  drawRow("Address", regAddressCombined);
  drawRow("City", fmt(data.regCity));
  drawRow("Postcode", fmt(data.regPostcode));
  drawRow("Country", fmt(data.regCountry));

  /* 4. Site / delivery address */
  drawSection("4. Site / delivery address");
  const siteAddressCombined = `${fmt(data.siteAddress1)}${
    data.siteAddress2 ? ", " + fmt(data.siteAddress2) : ""
  }`;
  drawRow("Address", siteAddressCombined);
  drawRow("City", fmt(data.siteCity));
  drawRow("Postcode", fmt(data.sitePostcode));
  drawRow("Country", fmt(data.siteCountry));

  /* 5. Signature & declaration (renumbered to keep sequence tidy) */
  drawSection("5. Signature & declaration");
  drawRow("Signed by", fmt(data.signatureName));
  drawRow("Job title", fmt(data.jobTitle));

  // Leave a bit of space before date + line
  y -= 6;

  // Signed date
  page.drawText("Signed date", {
    x: labelX,
    y,
    size: rowLabelSize,
    font: fontRegular,
    color: rgb(0.35, 0.35, 0.4),
  });

  page.drawText(signedDate.toLocaleDateString("en-GB"), {
    x: valueX,
    y,
    size: rowValueSize,
    font: fontRegular,
    color: rgb(0.05, 0.05, 0.12),
  });

  // Signature line
  const sigLineY = y - 20;
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
     Footer – legal disclaimer + company details (Option A)
     =========== */

  const footerFontSize = 8;
  const footerWidth = pageWidth - marginX * 2;
  let footerY = bottomMargin;

  function drawWrappedLines(text: string): void {
    const words = text.split(" ");
    let line = "";
    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      const testWidth = fontRegular.widthOfTextAtSize(testLine, footerFontSize);
      if (testWidth > footerWidth) {
        page.drawText(line, {
          x: marginX,
          y: footerY,
          size: footerFontSize,
          font: fontRegular,
          color: rgb(0.35, 0.35, 0.4),
        });
        footerY -= 10;
        line = word;
      } else {
        line = testLine;
      }
    }
    if (line) {
      page.drawText(line, {
        x: marginX,
        y: footerY,
        size: footerFontSize,
        font: fontRegular,
        color: rgb(0.35, 0.35, 0.4),
      });
      footerY -= 12;
    }
  }

  // Option A disclaimer
  drawWrappedLines(
    "All pricing and ROI calculations in this document are estimates only. They do not constitute financial advice, projections, or guarantees."
  );
  drawWrappedLines(
    `Final pricing may vary due to market changes, supply conditions and taxation. ${COMPANY_NAME} makes no assurance of future fuel savings and encourages customers to verify calculations independently.`
  );

  // Company details
  const companyLines: string[] = [];
  if (COMPANY_NAME) companyLines.push(COMPANY_NAME);
  if (COMPANY_NUMBER) companyLines.push(`Company No. ${COMPANY_NUMBER}`);
  if (COMPANY_VAT_NUMBER) companyLines.push(`VAT No. ${COMPANY_VAT_NUMBER}`);

  // Split address on real line breaks or "\n"
  const addressLines =
    COMPANY_ADDRESS.split(/\\n|\n/)
      .map((l) => l.trim())
      .filter(Boolean) || [];
  companyLines.push(...addressLines);

  const contactBits: string[] = [];
  if (COMPANY_EMAIL) contactBits.push(COMPANY_EMAIL);
  if (COMPANY_PHONE) contactBits.push(COMPANY_PHONE);
  if (contactBits.length) companyLines.push(contactBits.join(" · "));

  footerY -= 4;
  for (const line of companyLines) {
    page.drawText(line, {
      x: marginX,
      y: footerY,
      size: footerFontSize,
      font: fontRegular,
      color: rgb(0.3, 0.3, 0.35),
    });
    footerY -= 10;
  }

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}
