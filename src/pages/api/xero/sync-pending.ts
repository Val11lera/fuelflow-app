// src/pages/api/xero/sync-pending.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

// adjust the relative path if your structure is different,
// this path assumes: src/lib/xero.ts and src/pages/api/xero/sync-pending.ts
import {
  createXeroInvoiceForOrder,
  OrderRow as XeroOrderRow,
} from "../../../lib/xero";

function sb() {
  return createClient(
    (process.env.SUPABASE_URL as string) ||
      (process.env.NEXT_PUBLIC_SUPABASE_URL as string),
    process.env.SUPABASE_SERVICE_ROLE_KEY as string
  );
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Simple protection so random people can't trigger this
  const secret = req.query.secret;
  if (!secret || secret !== process.env.XERO_SYNC_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // 1) Load all PAID orders that are marked as pending for Xero
  const { data: orders, error } = await sb()
    .from("orders")
    .select(
      [
        "id",
        "name",
        "address_line1",
        "address_line2",
        "city",
        "postcode",
        "fuel",
        "litres",
        "unit_price_pence",
        "delivery_date",
        "cost_centre",
        "subjective_code",
        "xero_sync_status",
        "status",
      ].join(",")
    )
    .eq("status", "paid")
    .eq("xero_sync_status", "pending")
    .limit(20);

  if (error) {
    console.error("[xero] failed to fetch pending orders:", error);
    return res.status(500).json({ error: "Failed to fetch orders" });
  }

  const results: any[] = [];

  for (const o of orders || []) {
    const orderId = o.id as string;

    try {
      const orderForXero: XeroOrderRow = {
        id: o.id,
        name: o.name,
        address_line1: o.address_line1,
        address_line2: o.address_line2,
        city: o.city,
        postcode: o.postcode,
        fuel: o.fuel,
        litres: o.litres,
        unit_price_pence: o.unit_price_pence,
        delivery_date: o.delivery_date,
        cost_centre: o.cost_centre,
        subjective_code: o.subjective_code,
      };

      // 2) Create invoice in Xero using your existing helper
      const { xeroInvoiceId, xeroInvoiceNumber } =
        await createXeroInvoiceForOrder(orderForXero);

      // 3) Update order row with Xero IDs and mark as synced
      const { error: updateError } = await sb()
        .from("orders")
        .update({
          xero_invoice_id: xeroInvoiceId,
          xero_invoice_number: xeroInvoiceNumber,
          xero_synced_at: new Date().toISOString(),
          xero_sync_status: "ok",
          xero_sync_error: null,
        } as any)
        .eq("id", orderId);

      if (updateError) {
        console.error(
          "[xero] failed to update order with Xero invoice:",
          updateError
        );

        await sb()
          .from("orders")
          .update({
            xero_sync_status: "error",
            xero_sync_error: updateError.message ?? "Xero update error",
          } as any)
          .eq("id", orderId);

        results.push({
          orderId,
          status: "error",
          step: "update_order",
          error: updateError.message ?? "Xero update error",
        });
        continue;
      }

      results.push({
        orderId,
        status: "ok",
        xeroInvoiceId,
        xeroInvoiceNumber,
      });
    } catch (e: any) {
      console.error("[xero] sync failed for order", orderId, e);

      await sb()
        .from("orders")
        .update({
          xero_sync_status: "error",
          xero_sync_error: e?.message || String(e),
        } as any)
        .eq("id", orderId);

      results.push({
        orderId,
        status: "error",
        step: "create_invoice",
        error: e?.message || String(e),
      });
    }
  }

  return res.status(200).json({
    synced: results.filter((r) => r.status === "ok").length,
    results,
  });
}
