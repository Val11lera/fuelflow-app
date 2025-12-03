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

  // Try to embed logo (safe: if it fails, we just skip it)
  const logoUrl = "https://dashboard.fuelflow.co.uk/logo-email.png";
  try {
    const logoRes = await fetch(logoUrl);
    if (logoRes.ok) {
      const logoBytes = await logoRes.arrayBuffer();
      const logoImage = await pdfDoc.embedPng(logoBytes);
      const logoScale = 120 / logoImage.width; // max width 120
      const logoDims = logoImage.scale(logoScale);

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
    // ignore logo failures
  }

  // Header text (right-hand side)
  const signedDate = new Date(data.signedAtIso);
  page.drawText("FuelFlow Contract", {
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

  // Thin separator line
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
  const valueX = margin + 160;
  const rowGap = 16;

  function ensureSpace(rows: number = 1) {
    const needed = rows * rowGap + 40;
    if (y - needed < margin) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;

      // page header on subsequent pages
      page.drawText("FuelFlow Contract (continued)", {
        x: margin,
        y: y,
        size: 10,
        font: fontRegular,
        color: rgb(0.4, 0.4, 0.45),
      });
      y -= 20;
    }
  }

  function drawSection(title: string) {
    ensureSpace(2);
    // light grey background strip
    page.drawRectangle({
      x: margin,
      y: y - 6,
      width: pageWidth - margin * 2,
      height: 22,
      color: rgb(0.95, 0.96, 0.98),
    });

    page.drawText(title, {
      x: margin + 8,
      y: y,
      size: sectionTitleSize,
      font: fontBold,
      color: rgb(0.15, 0.18, 0.25),
    });

    y -= 28;
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
     Company details
     ================ */
  drawSection("1. Company details");
  drawRow("Company name", fmt(data.companyName));
  drawRow("Company number", fmt(data.companyNumber));
  drawRow("VAT number", fmt(data.vatNumber));

  /* ================
     Primary contact
     ================ */
  drawSection("2. Primary contact");
  drawRow("Name", fmt(data.primaryName));
  drawRow("Email", fmt(data.primaryEmail));
  drawRow("Phone", fmt(data.primaryPhone));

  /* ===========================
     Registered / billing address
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
     Site / delivery address
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
     Tank & ROI
     =========== */
  drawSection("5. Tank & ROI summary");
  drawRow("Tank size (L)", `${data.tankSizeL.toLocaleString("en-GB")} L`);
  drawRow(
    "Monthly consumption (L)",
    `${data.monthlyConsumptionL.toLocaleString("en-GB")} L`
  );
  drawRow("Market price (£/L)", `£${data.marketPricePerL.toFixed(2)}`);
  drawRow("FuelFlow price (£/L)", `£${data.fuelflowPricePerL.toFixed(2)}`);
  drawRow("Capex (£)", fmtMoney(data.capexGbp ?? null));
  drawRow("Est. monthly savings", fmtMoney(data.estMonthlySavingsGbp ?? null));
  drawRow("Est. payback", fmt(data.estPaybackText));

  /* ===========
     Signature
     =========== */
  drawSection("6. Signature & declaration");
  drawRow("Signed by", fmt(data.signatureName));
  drawRow("Job title", fmt(data.jobTitle));
  drawRow("Signed date", signedDate.toLocaleDateString("en-GB"));

  ensureSpace(3);

  // Signature line
  const lineY = y - 10;
  page.drawLine({
    start: { x: labelX, y: lineY },
    end: { x: labelX + 220, y: lineY },
    thickness: 0.8,
    color: rgb(0.2, 0.2, 0.25),
  });
  page.drawText("Authorised signatory", {
    x: labelX,
    y: lineY - 12,
    size: 9,
    font: fontRegular,
    color: rgb(0.25, 0.25, 0.3),
  });

  // Footer legal text
  const footerText =
    "By signing, the authorised representative confirms they are empowered to bind the company to this agreement. " +
    "The ROI figures set out above are estimates based on the information provided and are not guaranteed. " +
    "This contract is subject to the FuelFlow Terms & Conditions in force at the date of signing.";

  const footerFontSize = 8;
  const footerWidth = pageWidth - margin * 2;

  const words = footerText.split(" ");
  let line = "";
  let footerY = margin + 40;

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    const testWidth = fontRegular.widthOfTextAtSize(testLine, footerFontSize);
    if (testWidth > footerWidth) {
      page.drawText(line, {
        x: margin,
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
      x: margin,
      y: footerY,
      size: footerFontSize,
      font: fontRegular,
      color: rgb(0.35, 0.35, 0.4),
    });
  }

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}

