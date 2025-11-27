// src/lib/refinery-order-pdf.ts
// Builds a simple one-page PDF for refinery order confirmations.
// No commission information is included – only the amounts payable to the refinery.

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type RefineryOrderForPdf = {
  orderId: string;
  product: string | null;
  litres: number | null;
  deliveryDate: string | null;
  customerName: string | null;
  customerEmail: string | null;
  address: {
    line1: string | null;
    line2: string | null;
    city: string | null;
    postcode: string | null;
  };
  unitPriceGbp: number | null;
  totalCustomerGbp: number | null;
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

function fmtLitres(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return "—";
  return `${v.toLocaleString("en-GB")} L`;
}

export async function buildRefineryOrderPdf(order: RefineryOrderForPdf) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 portrait (roughly)
  const { width, height } = page.getSize();

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 50;
  let y = height - margin;

  const drawText = (text: string, opts?: { bold?: boolean; size?: number }) => {
    const size = opts?.size ?? 11;
    const f = opts?.bold ? fontBold : font;
    page.drawText(text, {
      x: margin,
      y,
      size,
      font: f,
      color: rgb(0.12, 0.12, 0.16),
    });
    y -= size + 6;
  };

  const drawLabelValue = (label: string, value: string) => {
    const labelSize = 10;
    const valueSize = 11;
    page.drawText(label, {
      x: margin,
      y,
      size: labelSize,
      font: fontBold,
      color: rgb(0.28, 0.28, 0.32),
    });
    y -= labelSize + 2;
    page.drawText(value, {
      x: margin,
      y,
      size: valueSize,
      font,
      color: rgb(0.12, 0.12, 0.16),
    });
    y -= valueSize + 10;
  };

  // Header bar
  const headerHeight = 40;
  page.drawRectangle({
    x: 0,
    y: height - headerHeight,
    width,
    height: headerHeight,
    color: rgb(0.03, 0.06, 0.14),
  });
  page.drawText("FuelFlow", {
    x: margin,
    y: height - headerHeight + 13,
    size: 16,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  page.drawText("Refinery order confirmation", {
    x: width - margin - 230,
    y: height - headerHeight + 15,
    size: 11,
    font,
    color: rgb(0.8, 0.8, 0.85),
  });

  y -= 40;

  // Title
  drawText("New FuelFlow order", { bold: true, size: 16 });
  drawText(
    "Commission amounts are excluded – all totals shown are the amounts payable to the refinery.",
    { size: 10 }
  );
  y -= 6;

  // Summary row (product / litres / delivery date / total payable to refinery)
  const boxTop = y;
  const boxHeight = 70;
  const colWidth = (width - margin * 2) / 4;

  page.drawRectangle({
    x: margin,
    y: boxTop - boxHeight,
    width: width - margin * 2,
    height: boxHeight,
    borderColor: rgb(0.85, 0.85, 0.9),
    borderWidth: 0.5,
    color: rgb(0.98, 0.98, 1),
  });

  const drawSummaryCell = (
    colIndex: number,
    heading: string,
    value: string
  ) => {
    const x = margin + colIndex * colWidth + 10;
    const yBase = boxTop - 20;
    page.drawText(heading.toUpperCase(), {
      x,
      y: yBase + 20,
      size: 9,
      font: fontBold,
      color: rgb(0.35, 0.35, 0.4),
    });
    page.drawText(value, {
      x,
      y: yBase,
      size: 12,
      font: fontBold,
      color: rgb(0.05, 0.05, 0.1),
    });
  };

  const deliveryDateStr = order.deliveryDate
    ? new Date(order.deliveryDate).toLocaleDateString("en-GB")
    : "Not set";

  drawSummaryCell(0, "Product", order.product || "—");
  drawSummaryCell(1, "Litres", order.litres != null ? String(order.litres) : "—");
  drawSummaryCell(2, "Delivery date", deliveryDateStr);
  drawSummaryCell(
    3,
    "Total payable to refinery",
    fmtMoney(order.totalForRefineryGbp)
  );

  y = boxTop - boxHeight - 25;

  // Detailed fields
  const addressLines = [
    order.address.line1,
    order.address.line2,
    order.address.city,
    order.address.postcode,
  ]
    .filter(Boolean)
    .join(", ");

  drawLabelValue("Order reference", order.orderId);
  drawLabelValue(
    "Customer",
    `${order.customerName || "—"}${
      order.customerEmail ? ` (${order.customerEmail})` : ""
    }`
  );
  drawLabelValue("Delivery address", addressLines || "—");
  drawLabelValue("Unit price (customer)", fmtMoney(order.unitPriceGbp));
  drawLabelValue("Total paid by customer", fmtMoney(order.totalCustomerGbp));
  drawLabelValue(
    "Total payable to refinery",
    fmtMoney(order.totalForRefineryGbp)
  );

  // Footer note
  y -= 10;
  page.drawText(
    "This order has already been paid in full by the customer via FuelFlow.",
    {
      x: margin,
      y,
      size: 9,
      font: fontBold,
      color: rgb(0.15, 0.15, 0.18),
    }
  );
  y -= 14;
  page.drawText(
    'Please arrange delivery and invoice FuelFlow for the "Total payable to refinery" amount only.',
    {
      x: margin,
      y,
      size: 9,
      font,
      color: rgb(0.18, 0.18, 0.22),
    }
  );

  // Tiny footer line with URL + ref
  const footerText = `FuelFlow · fuelflow.co.uk · support@fuelflow.co.uk    Ref: ${order.orderId}`;
  page.drawText(footerText, {
    x: margin,
    y: 30,
    size: 8,
    font,
    color: rgb(0.4, 0.4, 0.45),
  });

  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);

  return {
    pdfBuffer,
    filename: `refinery-order-${order.orderId}.pdf`,
  };
}
