// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import PDFDocument from "pdfkit";
import { sendMail } from "@/lib/mailer"; // keep as-is

type LineItem = {
  description: string;
  quantity: number;          // litres
  unitPrice: number;         // major units (e.g., 1.71 = £1.71)
};

type InvoicePayload = {
  customer: {
    name?: string | null;
    email: string;
    address_line1?: string | null;
    address_line2?: string | null;
    city?: string | null;
    postcode?: string | null;
  };
  items: LineItem[];
  currency: string; // "GBP" | "EUR" | "USD" | etc
  meta?: {
    invoiceNumber?: string;
    orderId?: string;
    notes?: string;
  };
};

export const config = {
  api: { bodyParser: true },
};

function bad(res: NextApiResponse, code: number, msg: string) {
  return res.status(code).json({ ok: false, error: msg });
}

function currencySymbol(cur: string) {
  const c = (cur || "").toUpperCase();
  if (c === "GBP") return "£";
  if (c === "EUR") return "€";
  if (c === "USD") return "$";
  return "";
}

/**
 * Build a professional VAT invoice.
 * - VAT is enabled by default (20%). Configure with env:
 *   - VAT_ENABLED=true|false (default true)
 *   - VAT_RATE=20 (percent, default 20)
 *   - PRICES_INCLUDE_VAT=true|false (default false) — set true if your unitPrice is gross
 * - Company details pulled from env for a clean template:
 *   COMPANY_NAME, COMPANY_ADDRESS (multi-line \n), COMPANY_EMAIL, COMPANY_PHONE,
 *   COMPANY_VAT_NUMBER, COMPANY_NUMBER
 */
async function buildPdf(payload: InvoicePayload): Promise<Buffer> {
  const VAT_ENABLED = process.env.VAT_ENABLED !== "false";
  const VAT_RATE = Math.max(
    0,
    parseFloat(process.env.VAT_RATE ?? "20")
  ) / 100; // 0.20
  const PRICES_INCLUDE_VAT = process.env.PRICES_INCLUDE_VAT === "true";

  const doc = new PDFDocument({ size: "A4", margin: 36 });

  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<void>((resolve) => doc.on("end", () => resolve()));

  const companyName = process.env.COMPANY_NAME || "FuelFlow";
  const companyAddr =
    process.env.COMPANY_ADDRESS ||
    "1 Example Street\nExample Town\nEX1 2MP\nUnited Kingdom";
  const companyEmail = process.env.COMPANY_EMAIL || "invoices@mail.fuelflow.co.uk";
  const companyPhone = process.env.COMPANY_PHONE || "";
  const companyVat = process.env.COMPANY_VAT_NUMBER || "";
  const companyNo = process.env.COMPANY_NUMBER || "";

  const cur = (payload.currency || "GBP").toUpperCase();
  const sym = currencySymbol(cur);
  const invNo =
    payload.meta?.invoiceNumber || `INV-${Math.floor(Date.now() / 1000)}`;
  const invDate = new Date().toLocaleDateString("en-GB");

  /* ======== Brand Header ======== */
  doc.rect(0, 0, doc.page.width, 70).fill("#0F172A"); // slate-900 bar
  doc.fill("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(22)
    .text(companyName, 36, 22, { width: doc.page.width - 72, align: "left" })
    .font("Helvetica")
    .fontSize(12)
    .text("TAX INVOICE", { align: "right" });

  doc.fill("#111827"); // back to dark text
  doc.moveDown();

  /* ======== Company & Bill To ======== */
  const leftColX = 36;
  const rightColX = doc.page.width / 2 + 10;
  let y = 90;

  doc.font("Helvetica-Bold").fontSize(11).text("From", leftColX, y);
  doc.font("Helvetica").fontSize(10);
  const supplierLines = [
    companyName,
    ...companyAddr.split("\n"),
    companyEmail ? `Email: ${companyEmail}` : undefined,
    companyPhone ? `Tel: ${companyPhone}` : undefined,
    companyNo ? `Company No: ${companyNo}` : undefined,
    companyVat ? `VAT No: ${companyVat}` : undefined,
  ].filter(Boolean) as string[];
  doc.text(supplierLines.join("\n"), { width: doc.page.width / 2 - 48 });

  doc.font("Helvetica-Bold").fontSize(11).text("Bill To", rightColX, y);
  doc.font("Helvetica").fontSize(10);
  const cust = payload.customer;
  const billLines = [
    cust.name || "Customer",
    cust.address_line1 || undefined,
    cust.address_line2 || undefined,
    [cust.city, cust.postcode].filter(Boolean).join(" ") || undefined,
    cust.email ? `Email: ${cust.email}` : undefined,
  ].filter(Boolean) as string[];
  doc.text(billLines.join("\n"), rightColX, y, { width: doc.page.width / 2 - 48 });

  /* ======== Invoice Meta ======== */
  y = doc.y + 16;
  doc
    .moveTo(leftColX, y)
    .lineTo(doc.page.width - 36, y)
    .strokeColor("#E5E7EB")
    .stroke();

  y += 10;
  doc.font("Helvetica-Bold").text("Invoice No:", leftColX, y);
  doc.font("Helvetica").text(invNo, leftColX + 95, y);

  doc.font("Helvetica-Bold").text("Date:", leftColX + 260, y);
  doc.font("Helvetica").text(invDate, leftColX + 310, y);

  if (payload.meta?.orderId) {
    y += 16;
    doc.font("Helvetica-Bold").text("Order Ref:", leftColX, y);
    doc.font("Helvetica").text(String(payload.meta.orderId), leftColX + 95, y);
  }

  /* ======== Compute Lines (with VAT support) ======== */
  type Row = {
    description: string;
    qty: number;
    unitEx: number; // ex-VAT unit price
    net: number;
    vatRatePct: number;
    vat: number;
    gross: number;
  };

  const rows: Row[] = [];
  let netTotal = 0;
  let vatTotal = 0;

  payload.items.forEach((it) => {
    const qty = Number(it.quantity || 0);
    const unitRaw = Number(it.unitPrice || 0);
    const unitEx = !VAT_ENABLED
      ? unitRaw
      : PRICES_INCLUDE_VAT
      ? unitRaw / (1 + VAT_RATE)
      : unitRaw;

    const net = qty * unitEx;
    const vat = VAT_ENABLED ? net * VAT_RATE : 0;
    const gross = net + vat;

    netTotal += net;
    vatTotal += vat;

    rows.push({
      description: it.description || "Item",
      qty,
      unitEx,
      net,
      vatRatePct: VAT_ENABLED ? VAT_RATE * 100 : 0,
      vat,
      gross,
    });
  });

  netTotal = Math.round(netTotal * 100) / 100;
  vatTotal = Math.round(vatTotal * 100) / 100;
  const grandTotal = Math.round((netTotal + vatTotal) * 100) / 100;

  /* ======== Table ======== */
  const tableX = 36;
  const tableW = doc.page.width - 72;
  let rowY = doc.y + 22;

  const cols = [
    { label: "Description", w: 180, align: "left" as const },
    { label: "Litres", w: 70, align: "right" as const },
    { label: "Unit (ex-VAT)", w: 95, align: "right" as const },
    { label: "Net", w: 90, align: "right" as const },
    { label: "VAT %", w: 55, align: "right" as const },
    { label: "VAT", w: 90, align: "right" as const },
    { label: "Total", w: 100, align: "right" as const },
  ];

  // Header band
  doc
    .rect(tableX, rowY, tableW, 24)
    .fill("#F3F4F6")
    .strokeColor("#E5E7EB")
    .stroke();
  doc.fill("#111827").font("Helvetica-Bold").fontSize(10);

  let x = tableX + 8;
  cols.forEach((c) => {
    const tx = c.align === "right" ? x + c.w - 8 : x;
    doc.text(c.label, tx, rowY + 7, { width: c.w - 16, align: c.align });
    x += c.w;
  });

  // Rows
  rowY += 24;
  doc.font("Helvetica").fontSize(10).fill("#111827");

  const money = (n: number) => sym + n.toFixed(2);

  rows.forEach((r, i) => {
    // zebra
    if (i % 2 === 1) {
      doc.rect(tableX, rowY, tableW, 22).fill("#FAFAFA");
      doc.fill("#111827");
    }
    x = tableX + 8;
    const cells = [
      { v: r.description, w: cols[0].w, align: cols[0].align },
      { v: r.qty.toLocaleString(), w: cols[1].w, align: cols[1].align },
      { v: money(r.unitEx), w: cols[2].w, align: cols[2].align },
      { v: money(r.net), w: cols[3].w, align: cols[3].align },
      { v: VAT_ENABLED ? `${r.vatRatePct.toFixed(0)}%` : "—", w: cols[4].w, align: cols[4].align },
      { v: VAT_ENABLED ? money(r.vat) : money(0), w: cols[5].w, align: cols[5].align },
      { v: money(r.gross), w: cols[6].w, align: cols[6].align },
    ] as const;

    cells.forEach((c) => {
      const tx = c.align === "right" ? x + c.w - 8 : x;
      doc.text(String(c.v), tx, rowY + 6, { width: c.w - 16, align: c.align });
      x += c.w;
    });

    // row border
    doc.rect(tableX, rowY, tableW, 22).strokeColor("#E5E7EB").stroke();
    rowY += 22;
  });

  // Totals block (right aligned)
  rowY += 10;
  const totalsW = cols.slice(-3).reduce((acc, c) => acc + c.w, 0);
  const totalsX = tableX + tableW - totalsW;

  const totals = [
    { label: "Subtotal (Net)", value: money(netTotal), bold: false },
    { label: "VAT", value: money(vatTotal), bold: false },
    { label: "Total", value: money(grandTotal), bold: true },
  ];

  totals.forEach((t, idx) => {
    const h = 22;
    doc
      .rect(totalsX, rowY, totalsW, h)
      .fill(idx === totals.length - 1 ? "#F3F4F6" : "#FFFFFF")
      .strokeColor("#E5E7EB")
      .stroke();

    doc.fill("#111827").font(t.bold ? "Helvetica-Bold" : "Helvetica");
    doc.text(t.label, totalsX + 12, rowY + 6, { width: totalsW / 2 - 12, align: "left" });
    doc.text(t.value, totalsX + totalsW / 2, rowY + 6, { width: totalsW / 2 - 12, align: "right" });

    rowY += h;
  });

  /* ======== Notes ======== */
  if (payload.meta?.notes) {
    rowY += 14;
    doc.font("Helvetica-Bold").text("Notes", tableX, rowY);
    doc.font("Helvetica").fill("#374151"); // slate-700
    doc.text(payload.meta.notes, tableX, rowY + 16, { width: tableW });
    doc.fill("#111827");
  }

  /* ======== Footer ======== */
  doc
    .font("Helvetica")
    .fontSize(9)
    .fill("#6B7280")
    .text(
      `${companyName} — Registered in England & Wales${
        companyNo ? " • Company No " + companyNo : ""
      }${companyVat ? " • VAT No " + companyVat : ""}`,
      36,
      doc.page.height - 40,
      { width: doc.page.width - 72, align: "center" }
    );

  doc.end();
  await done;
  return Buffer.concat(chunks);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return bad(res, 405, "Method Not Allowed");

  // Secret check
  const secret = req.headers["x-invoice-secret"];
  if (!process.env.INVOICE_SECRET) return bad(res, 500, "INVOICE_SECRET not set");
  if (!secret || secret !== process.env.INVOICE_SECRET) {
    return bad(res, 401, "Invalid invoice secret");
  }

  const payload = req.body as InvoicePayload;
  if (!payload?.customer?.email) return bad(res, 400, "Missing customer.email");
  if (!Array.isArray(payload.items) || payload.items.length === 0)
    return bad(res, 400, "Missing items");

  try {
    const pdf = await buildPdf(payload);
    const invNo = payload.meta?.invoiceNumber || `INV-${Math.floor(Date.now() / 1000)}`;

    const to = payload.customer.email;
    const bcc = process.env.MAIL_BCC || undefined;

    const id = await sendMail({
      to,
      bcc,
      subject: `${process.env.COMPANY_NAME || "FuelFlow"} — Invoice ${invNo}`,
      text: `Hi ${
        payload.customer.name || "there"
      },\n\nThank you for your order. Your invoice ${invNo} is attached.\n\nKind regards,\n${
        process.env.COMPANY_NAME || "FuelFlow"
      }`,
      attachments: [
        {
          filename: `${invNo}.pdf`,
          content: pdf,
          contentType: "application/pdf",
        },
      ],
    });

    return res.status(200).json({ ok: true, id });
  } catch (e: any) {
    console.error("invoice/create error", e);
    return bad(res, 500, e?.message || "invoice_error");
  }
}
