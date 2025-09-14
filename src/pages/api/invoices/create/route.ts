// src/app/api/invoices/create/route.ts
import PDFDocument from "pdfkit";
import { NextRequest, NextResponse } from "next/server";
import { sendInvoiceEmail } from "../../../lib/mailer";

type Line = { description: string; qty: number; unitPrice: number };
type InvoicePayload = {
  company: { name: string; address?: string };
  customer: { name: string; email?: string; address?: string };
  lines: Line[];
  notes?: string;
  email?: boolean;
  to?: string;
};

function renderInvoice(doc: PDFDocument, p: InvoicePayload) {
  const total = p.lines.reduce((acc, l) => acc + l.qty * l.unitPrice, 0);
  doc.fontSize(22).text("INVOICE", { align: "right" }).moveDown();
  doc.fontSize(12).text(p.company.name);
  if (p.company.address) doc.text(p.company.address);
  doc.moveDown();
  doc.text(`Bill To: ${p.customer.name}`);
  if (p.customer.address) doc.text(p.customer.address);
  doc.moveDown();

  p.lines.forEach((l) => {
    doc.text(`${l.description}  x${l.qty}  @ ${l.unitPrice.toFixed(2)}`);
  });

  doc.moveDown();
  doc.text(`Total: ${total.toFixed(2)}`, { align: "right" });
  if (p.notes) { doc.moveDown(); doc.text(p.notes); }
}

function makePdfBuffer(p: InvoicePayload): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", d => chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(d)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    renderInvoice(doc, p);
    doc.end();
  });
}

export async function POST(req: NextRequest) {
  const p = (await req.json()) as InvoicePayload;

  if (!p?.company?.name || !p?.customer?.name || !Array.isArray(p?.lines) || p.lines.length === 0) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const pdfBuffer = await makePdfBuffer(p);
  const filename = `INV-${Date.now()}.pdf`;

  const url = new URL(req.url);
  if (url.searchParams.get("format") === "pdf") {
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    });
  }

  let emailed = false;
  let emailError: string | undefined;

  if (p.email) {
    const to = p.to ?? p.customer.email;
    const from = process.env.MAIL_FROM;
    if (!to || !from) {
      return NextResponse.json(
        { error: "Missing email recipient or MAIL_FROM env var" },
        { status: 400 }
      );
    }

    const base64 = pdfBuffer.toString("base64");
    const subject = `${p.company.name} Invoice`;
    const html = `<p>Hi ${p.customer.name},</p><p>Attached is your invoice from ${p.company.name}.</p>`;

    const mail = await sendInvoiceEmail({
      to,
      from,
      subject,
      html,
      attachment: { filename, base64 },
    });

    emailed = mail.ok;
    if (!mail.ok) emailError = mail.error;
  }

  return NextResponse.json({ ok: true, filename, emailed, ...(emailError ? { emailError } : {}) });
}
