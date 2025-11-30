// src/pages/api/admin/usage/low-fuel.ts
// src/pages/api/admin/usage/low-fuel.ts

import type { NextApiRequest, NextApiResponse } from "next";
import supabaseAdmin from "@/lib/supabaseAdmin";

type LowFuelAlertRow = {
  contractId: string;
  email: string | null;
  displayName: string | null;
  tankSizeL: number | null;
  monthlyConsumptionL: number | null;
  percentFull: number;
  estimatedLitresLeft: number;
  daysSinceLastDelivery: number;
  lastDeliveryDate: string | null;
  lastDeliveredLitres: number;
  message: string;
};

type LowFuelResponse =
  | { ok: false; reason: string }
  | { ok: true; rows: LowFuelAlertRow[] };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LowFuelResponse>
) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, reason: "Method not allowed" });
  }

  try {
    // 1) Auth – admin only
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      return res.status(401).json({
        ok: false,
        reason: "Missing or invalid Authorization header",
      });
    }

    const token = auth.slice(7);
    const { data: userRes, error: userErr } =
      await supabaseAdmin.auth.getUser(token);

    if (userErr || !userRes?.user) {
      return res.status(401).json({ ok: false, reason: "Auth failed" });
    }

    const emailLower = (userRes.user.email || "").toLowerCase();

    // Only allow admins (admins table)
    const { data: adminRow } = await supabaseAdmin
      .from("admins")
      .select("email")
      .eq("email", emailLower)
      .maybeSingle();

    if (!adminRow?.email) {
      return res.status(403).json({ ok: false, reason: "Not an admin" });
    }

    // 2) Load approved contracts (rent + buy)
    const { data: contracts, error: contractsErr } = await supabaseAdmin
      .from("contracts")
      .select(
        "id, email, customer_name, company_name, status, tank_option, tank_size_l, monthly_consumption_l"
      )
      .eq("status", "approved");

    if (contractsErr) {
      return res
        .status(500)
        .json({ ok: false, reason: contractsErr.message });
    }

    if (!contracts || contracts.length === 0) {
      return res.status(200).json({ ok: true, rows: [] });
    }

    async function analyseContract(c: any): Promise<LowFuelAlertRow | null> {
      const tankSizeL = Number(c.tank_size_l) || 0;
      const monthlyUseL = Number(c.monthly_consumption_l) || 0;
      if (!tankSizeL || !monthlyUseL) return null;

      const dailyUseL = monthlyUseL / 30;
      const email = (c.email || "").toLowerCase();
      if (!email) return null;

      // Last order for this customer
      const { data: lastOrder, error: orderErr } = await supabaseAdmin
        .from("orders")
        .select("id, email, user_email, litres, delivery_date, created_at")
        .or(`email.eq.${email},user_email.eq.${email}`)
        .order("delivery_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (orderErr || !lastOrder) return null;

      const deliveryDateRaw =
        (lastOrder as any).delivery_date ||
        (lastOrder as any).created_at ||
        null;

      if (!deliveryDateRaw) return null;

      const deliveryDate = new Date(deliveryDateRaw);
      const now = new Date();
      const msDiff = now.getTime() - deliveryDate.getTime();
      const daysSince = msDiff / (1000 * 60 * 60 * 24);

      const rawDelivered = Number((lastOrder as any).litres) || 0;

      // Ignore tiny "test" orders
      const minValidDelivery = Math.min(
        tankSizeL,
        Math.max(tankSizeL * 0.1, 500)
      );
      if (!rawDelivered || rawDelivered < minValidDelivery) {
        return null;
      }

      const deliveredLitres = Math.min(rawDelivered, tankSizeL);

      // Estimate tank level
      const estimatedUsed = Math.max(dailyUseL * daysSince, 0);
      const estimatedLeft = Math.max(deliveredLitres - estimatedUsed, 0);

      const percentFull = tankSizeL
        ? Math.max(Math.min(estimatedLeft / tankSizeL, 1), 0)
        : 0;

      const threshold = 0.3; // 30%
      const showReminder = percentFull <= threshold;
      if (!showReminder) return null;

      const pct = Math.round(percentFull * 100);
      const litresLeftRounded = Math.round(estimatedLeft);

      const msg = `Our estimate shows your tank might be around ${pct}% full (about ${litresLeftRounded.toLocaleString()} litres remaining) based on your usual usage. You may want to place another order to avoid running low.`;

      return {
        contractId: c.id,
        email,
        displayName: c.customer_name || c.company_name || c.email || null,
        tankSizeL: tankSizeL || null,
        monthlyConsumptionL: monthlyUseL || null,
        percentFull,
        estimatedLitresLeft: estimatedLeft,
        daysSinceLastDelivery: daysSince,
        lastDeliveryDate: deliveryDate.toISOString(),
        lastDeliveredLitres: deliveredLitres,
        message: msg,
      };
    }

    const analysed = await Promise.all(
      contracts
        .filter((c) => !!c.tank_size_l && !!c.monthly_consumption_l)
        .map((c) => analyseContract(c))
    );

    const rows = analysed.filter(
      (x): x is LowFuelAlertRow => x !== null
    );

    return res.status(200).json({ ok: true, rows });
  } catch (e: any) {
    console.error("low-fuel admin API error", e);
    return res.status(500).json({
      ok: false,
      reason: e?.message || "Server error",
    });
  }
}

