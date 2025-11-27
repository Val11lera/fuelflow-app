// src/pages/api/admin/send-refinery-order.ts
// src/pages/api/admin/send-refinery-order.ts
// Creates a refinery-friendly "order sheet" (no commission shown)
// and marks the order as sent to the refinery.

import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

type Fuel = "petrol" | "diesel";

type OrderRow = {
  id: string;
  user_email: string | null;
  fuel: Fuel | null;
  litres: number | null;
  unit_price_pence: number | null;
  total_pence: number | null;
  delivery_date: string | null;
  name: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postcode: string | null;
  status: string | null;
  refinery_notification_status: string | null;
  refinery_invoice_storage_path: string | null;
};

type Body = {
  orderId?: string;
  adminEmail?: string; // email of the admin clicking the button
};

type OkResponse = {
  ok: true;
  refineryOrder: {
    orderId: string;
    customerName: string | null;
    customerEmail: string | null;
    address: {
      line1: string | null;
      line2: string | null;
      city: string | null;
      postcode: string | null;
    };
    fuel: string | null;
    litres: number | null;
    unitPriceGbp: number | null;
    totalCustomerGbp: number | null;
    totalForRefineryGbp: number | null;
    deliveryDate: string | null;
    invoiceStoragePath: string | null;
  };
};

type ErrorResponse = { ok: false; error: string };

export type SendRefineryOrderResponse = OkResponse | ErrorResponse;

// ----- Supabase (service role) -----

function sbAdmin() {
  const url =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return createClient(url, key);
}

// Same % env vars you used in create-checkout-session
function getCommissionPercent(fuel: Fuel | null): number {
  if (fuel === "petrol") {
    return Number(process.env.PETROL_COMMISSION_PERCENT || "0");
  }
  if (fuel === "diesel") {
    return Number(process.env.DIESEL_COMMISSION_PERCENT || "0");
  }
  return 0;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SendRefineryOrderResponse>
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const { orderId, adminEmail } = (req.body || {}) as Body;

    if (!orderId) {
      return res
        .status(400)
        .json({ ok: false, error: "Missing orderId in request body" });
    }

    if (!adminEmail) {
      return res
        .status(400)
        .json({ ok: false, error: "Missing adminEmail in request body" });
    }

    const supabase = sbAdmin();

    // --- 1) Check this email is an admin (very simple check to avoid random calls) ---
    const { data: adminRow, error: adminError } = await supabase
      .from("admins")
      .select("id")
      .eq("email", adminEmail.toLowerCase())
      .maybeSingle();

    if (adminError) {
      console.error("[send-refinery-order] admin lookup error:", adminError);
      return res
        .status(500)
        .json({ ok: false, error: "Failed to verify admin" });
    }

    if (!adminRow) {
      return res
        .status(403)
        .json({ ok: false, error: "Not authorised (admin only)" });
    }

    // --- 2) Load the order ---
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select(
        "id,user_email,fuel,litres,unit_price_pence,total_pence,delivery_date,name,address_line1,address_line2,city,postcode,status,refinery_notification_status,refinery_invoice_storage_path"
      )
      .eq("id", orderId)
      .maybeSingle();

    if (orderError) {
      console.error("[send-refinery-order] order query error:", orderError);
      return res
        .status(500)
        .json({ ok: false, error: "Failed to load order" });
    }

    if (!order) {
      return res
        .status(404)
        .json({ ok: false, error: "Order not found" });
    }

    const o = order as unknown as OrderRow;

    if (o.status !== "paid") {
      return res.status(400).json({
        ok: false,
        error: `Order is not paid (current status: ${o.status || "unknown"})`,
      });
    }

    // Optional guard: don't resend if already marked sent
    if (o.refinery_notification_status === "sent") {
      return res.status(400).json({
        ok: false,
        error: "Order already marked as sent to refinery",
      });
    }

    const totalPence = o.total_pence ?? null;
    const unitPence = o.unit_price_pence ?? null;

    const totalCustomerGbp =
      totalPence != null ? Math.round(totalPence) / 100 : null;
    const unitPriceGbp =
      unitPence != null ? Math.round(unitPence) / 100 : null;

    // --- 3) Compute the amount refinery should see (hide platform commission) ---
    let totalForRefineryGbp: number | null = null;
    if (totalPence != null) {
      const pct = getCommissionPercent(o.fuel);
      const commissionPence = Math.round(totalPence * (pct / 100));
      const refineryPence = totalPence - commissionPence;
      totalForRefineryGbp = refineryPence / 100;
    }

    // --- 4) Build refinery-friendly order sheet (no commission visible) ---
    const refineryOrder = {
      orderId: o.id,
      customerName: o.name,
      customerEmail: o.user_email,
      address: {
        line1: o.address_line1,
        line2: o.address_line2,
        city: o.city,
        postcode: o.postcode,
      },
      fuel: o.fuel,
      litres: o.litres,
      unitPriceGbp,
      totalCustomerGbp,
      totalForRefineryGbp,
      deliveryDate: o.delivery_date,
      invoiceStoragePath: o.refinery_invoice_storage_path,
    };

    // --- 5) Mark the order as "sent" (so we don't send twice) ---
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        refinery_notification_status: "sent",
        refinery_notified_at: new Date().toISOString(),
      } as any)
      .eq("id", o.id);

    if (updateError) {
      console.error(
        "[send-refinery-order] failed to update order status:",
        updateError
      );
      return res
        .status(500)
        .json({ ok: false, error: "Failed to update order status" });
    }

    // NOTE: At this point you have a clean `refineryOrder` object.
    // You can plug in your email sending here if you want to fully automate it.
    // For now we just return it to the admin dashboard to display / copy.

    return res.status(200).json({
      ok: true,
      refineryOrder,
    });
  } catch (err: any) {
    console.error("[send-refinery-order] crash:", err);
    return res
      .status(500)
      .json({ ok: false, error: err?.message || "Server error" });
  }
}

