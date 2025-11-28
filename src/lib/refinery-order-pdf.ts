// src/lib/refinery-order-pdf.ts
// Builds a clean refinery order PDF (no commission, no "total paid by customer")

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type RefineryOrderForPdf = {
  orderId: string;
  refineryRef: string;
  product: string | null;
  litres: number | null;
  deliveryDate: string | null;
  customerName: string | null;
  customerEmail: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postcode: string | null;
  unitPriceGbp: number | null;
  totalForRefineryGbp: number | null;
};

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

function fmtMoney(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return "—";
  return gbp.format(v);
}

function fmtDate(dateIso: string | null) {
  if (!dateIso) return "Not set";
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return "Not set";
  return d.toLocaleDateString("en-GB");
}

export async function buildRefineryOrderPdf(data: RefineryOrderForPdf) {
  const {
    orderId,
    refineryRef,
    product,
    litres,
    deliveryDate,
    customerName,
    customerEmail,
    addressLine1,
    addressLine2,
    city,
    postcode,
    unitPriceGbp,
    totalForRefineryGbp,
  } = data;

  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4 portrait
  const { width, height } = page.getSize();
  const margin = 40;

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = height - margin;

  // Header bar
  const headerHeight = 60;
  page.drawRectangle({
    x: 0,
    y: height - headerHeight,
    width,
    height: headerHeight,
    color: rgb(5 / 255, 8 / 255, 22 / 255),
  });

  page.drawText("FuelFlow", {
    x: margin,
    y: height - headerHeight + 20,
    size: 18,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  page.drawText("REFINERY ORDER CONFIRMATION", {
    x: width - margin - 260,
    y: height - headerHeight + 26,
    size: 11,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  y = height - headerHeight - 32;

  const drawLabelValue = (
    label: string,
    value: string,
    xPos: number,
    yPos: number
  ) => {
    page.drawText(label, {
      x: xPos,
      y: yPos,
      size: 9,
      font: fontBold,
      color: rgb(0.25, 0.29, 0.35),
    });
    page.drawText(value, {
      x: xPos,
      y: yPos - 14,
      size: 10,
      font,
      color: rgb(0.06, 0.07, 0.1),
    });
  };

  // Top summary block
  drawLabelValue("Order ref", orderId, margin, y);
  drawLabelValue("Refinery ref", refineryRef, margin + 200, y);
  drawLabelValue("Delivery date", fmtDate(deliveryDate), margin + 380, y);

  y -= 50;

  // Customer / address
  drawLabelValue(
    "Customer",
    `${customerName || "—"}${customerEmail ? ` (${customerEmail})` : ""}`,
    margin,
    y
  );

  const addressLines = [
    addressLine1 || "",
    addressLine2 || "",
    [city, postcode].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");

  drawLabelValue("Delivery address", addressLines || "—", margin, y - 36);

  y -= 90;

  // Table header
  const tableLeft = margin;
  const tableRight = width - margin;
  const rowHeight = 22;

  const colProduct = tableLeft;
  const colLitres = tableLeft + 220;
  const colUnit = tableLeft + 320;
  const colTotal = tableLeft + 430;

  // Header background
  page.drawRectangle({
    x: tableLeft,
    y: y,
    width: tableRight - tableLeft,
    height: rowHeight,
    color: rgb(0.97, 0.98, 1),
  });

  const headerY = y + 6;

  page.drawText("Product", {
    x: colProduct + 4,
    y: headerY,
    size: 9,
    font: fontBold,
    color: rgb(0.29, 0.33, 0.4),
  });
  page.drawText("Litres", {
    x: colLitres + 4,
    y: headerY,
    size: 9,
    font: fontBold,
    color: rgb(0.29, 0.33, 0.4),
  });
  page.drawText("Unit price (customer)", {
    x: colUnit + 4,
    y: headerY,
    size: 9,
    font: fontBold,
    color: rgb(0.29, 0.33, 0.4),
  });
  page.drawText("Total payable to refinery", {
    x: colTotal + 4,
    y: headerY,
    size: 9,
    font: fontBold,
    color: rgb(0.29, 0.33, 0.4),
  });

  // Table border
  page.drawRectangle({
    x: tableLeft,
    y: y,
    width: tableRight - tableLeft,
    height: rowHeight,
    borderColor: rgb(0.89, 0.9, 0.95),
    borderWidth: 1,
  });

  // Single row
  const rowY = y - rowHeight;

  page.drawRectangle({
    x: tableLeft,
    y: rowY,
    width: tableRight - tableLeft,
    height: rowHeight,
    borderColor: rgb(0.89, 0.9, 0.95),
    borderWidth: 1,
    color: rgb(1, 1, 1),
  });

  const valueY = rowY + 6;

  page.drawText(product || "—", {
    x: colProduct + 4,
    y: valueY,
    size: 10,
    font,
    color: rgb(0.06, 0.07, 0.1),
  });

  page.drawText(
    litres != null ? String(litres) : "—",
    {
      x: colLitres + 4,
      y: valueY,
      size: 10,
      font,
      color: rgb(0.06, 0.07, 0.1),
    }
  );

  page.drawText(fmtMoney(unitPriceGbp), {
    x: colUnit + 4,
    y: valueY,
    size: 10,
    font,
    color: rgb(0.06, 0.07, 0.1),
  });

  page.drawText(fmtMoney(totalForRefineryGbp), {
    x: colTotal + 4,
    y: valueY,
    size: 10,
    font,
    color: rgb(0.06, 0.07, 0.1),
  });

  y = rowY - 40;

  // Summary
  drawLabelValue("Total payable to refinery", fmtMoney(totalForRefineryGbp), tableRight - 260, y);

  y -= 50;

  const noteText =
    'This order has already been paid in full by the customer via FuelFlow. ' +
    'Please arrange delivery and invoice FuelFlow for the "Total payable to refinery" amount only.';

  page.drawText(noteText, {
    x: margin,
    y,
    size: 9,
    font,
    color: rgb(0.29, 0.33, 0.4),
    maxWidth: width - margin * 2,
    lineHeight: 11,
  });

  // Footer
  page.drawLine({
    start: { x: margin, y: margin + 30 },
    end: { x: width - margin, y: margin + 30 },
    thickness: 0.5,
    color: rgb(0.89, 0.9, 0.95),
  });

  page.drawText(
    "FuelFlow · fuelflow.co.uk · support@fuelflow.co.uk",
    {
      x: margin,
      y: margin + 16,
      size: 8,
      font,
      color: rgb(0.45, 0.49, 0.56),
    }
  );

  page.drawText(`Ref: ${refineryRef}`, {
    x: width - margin - 140,
    y: margin + 16,
    size: 8,
    font,
    color: rgb(0.45, 0.49, 0.56),
  });

  const pdfBytes = await doc.save();
  const pdfBuffer = Buffer.from(pdfBytes);

  const filename = `refinery-order-${orderId}.pdf`;

  return { pdfBuffer, filename };
}
