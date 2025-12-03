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

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

function fmtMoney(v: number | null | undefined) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return gbp.format(v);
}

function fmt(v: string | null | undefined) {
  return v && v.trim() ? v.trim() : "—";
}

export async function generateContractPdf(data: ContractForPdf): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4 portrait
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Optional: light grey header bar
  page.drawRectangle({
    x: 0,
    y: 800,
    width: 595,
    height: 42,
    color: rgb(0.15, 0.15, 0.18),
  });

  page.drawText("FuelFlow – Contract Summary", {
    x: 40,
    y: 813,
    size: 16,
    font,
    color: rgb(1, 1, 1),
  });

  // Little subtitle with date
  const signedDate = new Date(data.signedAtIso);
  page.drawText(
    `Signed on ${signedDate.toLocaleDateString("en-GB")} by ${fmt(data.signatureName)}`,
    {
      x: 40,
      y: 798,
      size: 10,
      font,
      color: rgb(0.9, 0.9, 0.9),
    }
  );

  let y = 770;
  const marginLeft = 40;
  const lineGap = 18;

  const drawSection = (title: string) => {
    y -= 10;
    page.drawText(title, {
      x: marginLeft,
      y,
      size: 12,
      font,
      color: rgb(0, 0, 0),
    });
    y -= lineGap;
  };

  const drawField = (label: string, value: string) => {
    page.drawText(label, {
      x: marginLeft,
      y,
      size: 9,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
    y -= 10;
    page.drawText(value, {
      x: marginLeft,
      y,
      size: 11,
      font,
      color: rgb(0, 0, 0),
    });
    y -= lineGap;
    // new page if we get too low
    if (y < 80) {
      y = 770;
      pdfDoc.addPage([595, 842]);
    }
  };

  /* ===========
     Company Details
     =========== */
  drawSection("Company details");
  drawField("Company name", fmt(data.companyName));
  drawField("Company number", fmt(data.companyNumber));
  drawField("VAT number", fmt(data.vatNumber));

  /* ===========
     Primary contact
     =========== */
  drawSection("Primary contact");
  drawField("Name", fmt(data.primaryName));
  drawField("Email", fmt(data.primaryEmail));
  drawField("Phone", fmt(data.primaryPhone));

  /* ===========
     Registered / billing address
     =========== */
  drawSection("Registered / billing address");
  drawField(
    "Address",
    `${fmt(data.regAddress1)}${data.regAddress2 ? ", " + fmt(data.regAddress2) : ""}`
  );
  drawField("City", fmt(data.regCity));
  drawField("Postcode", fmt(data.regPostcode));
  drawField("Country", fmt(data.regCountry));

  /* ===========
     Site / delivery address
     =========== */
  drawSection("Site / delivery address");
  drawField(
    "Address",
    `${fmt(data.siteAddress1)}${data.siteAddress2 ? ", " + fmt(data.siteAddress2) : ""}`
  );
  drawField("City", fmt(data.siteCity));
  drawField("Postcode", fmt(data.sitePostcode));
  drawField("Country", fmt(data.siteCountry));

  /* ===========
     Tank & ROI
     =========== */
  drawSection("Tank & ROI");
  drawField("Tank size (L)", `${data.tankSizeL.toLocaleString("en-GB")} L`);
  drawField(
    "Monthly consumption (L)",
    `${data.monthlyConsumptionL.toLocaleString("en-GB")} L`
  );
  drawField("Market price (£/L)", `£${data.marketPricePerL.toFixed(2)}`);
  drawField("FuelFlow price (£/L)", `£${data.fuelflowPricePerL.toFixed(2)}`);
  drawField("Capex (£)", fmtMoney(data.capexGbp ?? null));
  drawField("Est. monthly savings", fmtMoney(data.estMonthlySavingsGbp ?? null));
  drawField("Est. payback", fmt(data.estPaybackText));

  /* ===========
     Signature
     =========== */
  drawSection("Signature");
  drawField("Signed by", fmt(data.signatureName));
  drawField("Job title", fmt(data.jobTitle));
  drawField("Signed date", signedDate.toLocaleDateString("en-GB"));

  page.drawText(
    "By signing you agreed to the FuelFlow terms and that ROI figures are estimates only.",
    {
      x: marginLeft,
      y: 60,
      size: 8,
      font,
      color: rgb(0.4, 0.4, 0.4),
    }
  );

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}
