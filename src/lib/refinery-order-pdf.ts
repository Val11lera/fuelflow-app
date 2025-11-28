// src/lib/refinery-order-pdf.ts
// src/lib/refinery-order-pdf.ts
// Build a simple refinery order confirmation PDF
// with NO commission / unit price shown.

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

function fmtMoney(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return "—";
  return gbp.format(v);
}

function fmtDate(dateIso: string | null | undefined) {
  if (!dateIso) return "Not set";
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return "Not set";
  return d.toLocaleDateString("en-GB");
}

export type RefineryOrderForPdf = {
  orderId: string;
  refineryRef: string;
  product: string;
  litres: number;
  deliveryDate: string | null;
  customerName: string | null;
  customerEmail: string | null;
  addressLines: string;
  // customer unit price is passed in but NOT rendered – kept only
  // in case you want it later for internal use.
  unitPriceCustomerGbp: number | null;
  totalForRefineryGbp: number | null;
};

export async function buildRefineryOrderPdf(
  props: RefineryOrderForPdf
): Promise<{ pdfBuffer: Buffer; filename: string }> {
  const {
    orderId,
    refineryRef,
    product,
    litres,
    deliveryDate,
    customerName,
    customerEmail,
    addressLines,
    totalForRefineryGbp,
  } = props;

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage();
  const { width, height } = page.getSize();

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // ---------- Header with dark bar & logo ----------
  const headerHeight = 70;
  page.drawRectangle({
    x: 0,
    y: height - headerHeight,
    width,
    height: headerHeight,
    color: rgb(5 / 255, 8 / 255, 22 / 255),
  });

  let logoWidth = 0;

  try {
    const logoUrl =
      process.env.PDF_LOGO_URL ||
      "https://dashboard.fuelflow.co.uk/logo-email.png";

    const res = await fetch(logoUrl);
    if (res.ok) {
      const arr = await res.arrayBuffer();
      const logoImage = await pdfDoc.embedPng(arr);
      const scaled = logoImage.scale(0.3);
      logoWidth = scaled.width;

      page.drawImage(logoImage, {
        x: 40,
        y: height - headerHeight / 2 - scaled.height / 2,
        width: scaled.width,
        height: scaled.height,
      });
    }
  } catch (e) {
    // fall back to text logo
    const text = "FuelFlow";
    page.drawText(text, {
      x: 40,
      y: height - 45,
      size: 20,
      font: fontBold,
      color: rgb(1, 1, 1),
    });
    logoWidth = fontBold.widthOfTextAtSize("FuelFlow", 20);
  }

  // Header title on the right
  const headerTitle = "REFINERY ORDER CONFIRMATION";
  const headerSize = 12;
  const headerWidth = fontBold.widthOfTextAtSize(headerTitle, headerSize);
  page.drawText(headerTitle, {
    x: width - headerWidth - 40,
    y: height - 42,
    size: headerSize,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  // ---------- Body ----------
  let cursorY = height - headerHeight - 40;
  const leftMargin = 50;

  const drawLabelValue = (
    label: string,
    value: string,
    x: number,
    y: number
  ) => {
    const labelSize = 9;
    const valueSize = 11;

    page.drawText(label, {
      x,
      y,
      size: labelSize,
      font: fontBold,
      color: rgb(0.27, 0.30, 0.38),
    });

    page.drawText(value, {
      x,
      y: y - 13,
      size: valueSize,
      font,
      color: rgb(0.08, 0.09, 0.12),
    });
  };

  // Top row: Order ref / Refinery ref / Delivery date
  const colWidth = (width - leftMargin * 2) / 3;

  drawLabelValue(
    "Order ref",
    orderId,
    leftMargin,
    cursorY
  );
  drawLabelValue(
    "Refinery ref",
    refineryRef,
    leftMargin + colWidth,
    cursorY
  );
  drawLabelValue(
    "Delivery date",
    fmtDate(deliveryDate),
    leftMargin + colWidth * 2,
    cursorY
  );

  cursorY -= 40;

  // Customer
  const customerLine = `${customerName || "—"}${
    customerEmail ? ` (${customerEmail})` : ""
  }`;
  drawLabelValue("Customer", customerLine, leftMargin, cursorY);
  cursorY -= 40;

  // Delivery address
  drawLabelValue("Delivery address", addressLines || "—", leftMargin, cursorY);
  cursorY -= 50;

  // ---------- Table (Product, Litres, Total payable) ----------
  const tableX = leftMargin;
  const tableY = cursorY;
  const tableWidth = width - leftMargin * 2;
  const headerBg = rgb(0.97, 0.98, 1);
  const borderColor = rgb(0.89, 0.90, 0.94);

  const colProductWidth = tableWidth * 0.4;
  const colLitresWidth = tableWidth * 0.2;
  const colTotalWidth = tableWidth * 0.4;

  const rowHeight = 22;

  // table header background
  page.drawRectangle({
    x: tableX,
    y: tableY - rowHeight,
    width: tableWidth,
    height: rowHeight,
    color: headerBg,
  });

  // header borders
  page.drawRectangle({
    x: tableX,
    y: tableY - rowHeight,
    width: tableWidth,
    height: rowHeight,
    borderColor,
    borderWidth: 0.5,
    color: headerBg,
  });

  // header text
  const headerTextY = tableY - rowHeight + 6;
  page.drawText("Product", {
    x: tableX + 6,
    y: headerTextY,
    size: 9,
    font: fontBold,
    color: rgb(0.29, 0.34, 0.43),
  });
  page.drawText("Litres", {
    x: tableX + colProductWidth + 6,
    y: headerTextY,
    size: 9,
    font: fontBold,
    color: rgb(0.29, 0.34, 0.43),
  });
  page.drawText("Total payable to refinery", {
    x: tableX + colProductWidth + colLitresWidth + 6,
    y: headerTextY,
    size: 9,
    font: fontBold,
    color: rgb(0.29, 0.34, 0.43),
  });

  // data row border
  const rowY = tableY - rowHeight * 2;
  page.drawRectangle({
    x: tableX,
    y: rowY,
    width: tableWidth,
    height: rowHeight,
    borderColor,
    borderWidth: 0.5,
    color: rgb(1, 1, 1),
  });

  const valueY = rowY + 6;

  page.drawText(product || "Fuel", {
    x: tableX + 6,
    y: valueY,
    size: 10,
    font,
    color: rgb(0.08, 0.09, 0.12),
  });

  page.drawText(String(litres ?? 0), {
    x: tableX + colProductWidth + 6,
    y: valueY,
    size: 10,
    font,
    color: rgb(0.08, 0.09, 0.12),
  });

  page.drawText(fmtMoney(totalForRefineryGbp), {
    x: tableX + colProductWidth + colLitresWidth + 6,
    y: valueY,
    size: 10,
    font,
    color: rgb(0.08, 0.09, 0.12),
  });

  cursorY = rowY - 40;

  // Total payable summary
  page.drawText("Total payable to refinery", {
    x: leftMargin,
    y: cursorY,
    size: 10,
    font: fontBold,
    color: rgb(0.08, 0.09, 0.12),
  });
  page.drawText(fmtMoney(totalForRefineryGbp), {
    x: leftMargin,
    y: cursorY - 16,
    size: 11,
    font: fontBold,
    color: rgb(0.08, 0.09, 0.12),
  });

  cursorY -= 46;

  // Note text
  const noteText =
    'This order has already been paid in full by the customer via FuelFlow. ' +
    'Please arrange delivery and invoice FuelFlow for the "Total payable to refinery" amount only.';

  const noteSize = 9;
  const maxNoteWidth = width - leftMargin * 2;
  const words = noteText.split(" ");
  let line = "";
  let noteY = cursorY;

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, noteSize);
    if (testWidth > maxNoteWidth) {
      page.drawText(line, {
        x: leftMargin,
        y: noteY,
        size: noteSize,
        font,
        color: rgb(0.27, 0.30, 0.38),
      });
      noteY -= 12;
      line = word;
    } else {
      line = testLine;
    }
  }
  if (line) {
    page.drawText(line, {
      x: leftMargin,
      y: noteY,
      size: noteSize,
      font,
      color: rgb(0.27, 0.30, 0.38),
    });
  }

  const pdfBytes = await pdfDoc.save();
  const filename = `refinery-order-${orderId}.pdf`;

  return {
    pdfBuffer: Buffer.from(pdfBytes),
    filename,
  };
}
