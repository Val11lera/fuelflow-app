// src/pages/api/usage/reminder.ts
// src/pages/api/usage/reminder.ts

import type { NextApiRequest, NextApiResponse } from "next";
import supabaseAdmin from "@/lib/supabaseAdmin";

type ReminderResponse =
  | { ok: false; reason: string }
  | {
      ok: true;
      showReminder: boolean;
      message?: string;
      percentFull?: number;
      daysSinceLastDelivery?: number;
      estimatedLitresLeft?: number;
      contractTankSize?: number | null;
      contractMonthlyConsumption?: number | null;
    };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ReminderResponse>
) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, reason: "Method not allowed" });
  }

  try {
    /* ---------------------------------------------------
       1) Auth
       --------------------------------------------------- */
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

    const user = userRes.user;
    const emailLower = (user.email || "").toLowerCase();

    /* ---------------------------------------------------
       1b) OPTIONAL: force a demo reminder for your test account
           (remove this block when you go fully live)
       --------------------------------------------------- */
    if (emailLower === "fuelflow.queries@gmail.com") {
      return res.status(200).json({
        ok: true,
        showReminder: true,
        message:
          "Demo: Based on your test data we think you might want to schedule a top-up soon. This is only a preview of the reminder card.",
        percentFull: 0.35, // 35% full (example)
        daysSinceLastDelivery: 25,
        estimatedLitresLeft: 1750,
        contractTankSize: 5000,
        contractMonthlyConsumption: 2000,
      });
    }

    /* ---------------------------------------------------
       2) Active contract (we only care about approved)
       --------------------------------------------------- */
    const { data: contract, error: contractErr } = await supabaseAdmin
      .from("contracts")
      .select(
        "id, status, tank_size_l, monthly_consumption_l, email, tank_option"
      )
      .eq("email", emailLower)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (contractErr) {
      return res
        .status(500)
        .json({ ok: false, reason: contractErr.message });
    }

    if (!contract) {
      // No active contract -> nothing to remind about
      return res.status(200).json({
        ok: true,
        showReminder: false,
        contractTankSize: null,
        contractMonthlyConsumption: null,
      });
    }

    const tankSizeL = Number(contract.tank_size_l) || 0;
    const monthlyUseL = Number(contract.monthly_consumption_l) || 0;

    if (!tankSizeL || !monthlyUseL) {
      // Missing key pieces of info – skip reminder
      return res.status(200).json({
        ok: true,
        showReminder: false,
        contractTankSize: tankSizeL || null,
        contractMonthlyConsumption: monthlyUseL || null,
      });
    }

    const dailyUseL = monthlyUseL / 30;

    /* ---------------------------------------------------
       3) Last delivery / order
       --------------------------------------------------- */
    const { data: lastOrder, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select("id, email, user_email, litres, delivery_date, created_at")
      // handle either email or user_email column
      .or(`email.eq.${emailLower},user_email.eq.${emailLower}`)
      .order("delivery_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (orderErr) {
      return res.status(500).json({ ok: false, reason: orderErr.message });
    }

    if (!lastOrder) {
      // No orders yet – no "running low" reminder
      return res.status(200).json({
        ok: true,
        showReminder: false,
        contractTankSize: tankSizeL,
        contractMonthlyConsumption: monthlyUseL,
      });
    }

    const deliveryDateRaw =
      (lastOrder as any).delivery_date || (lastOrder as any).created_at || null;

    if (!deliveryDateRaw) {
      return res.status(200).json({
        ok: true,
        showReminder: false,
        contractTankSize: tankSizeL,
        contractMonthlyConsumption: monthlyUseL,
      });
    }

    const deliveryDate = new Date(deliveryDateRaw);
    const now = new Date();
    const msDiff = now.getTime() - deliveryDate.getTime();
    const daysSince = msDiff / (1000 * 60 * 60 * 24);

    const rawDelivered = Number((lastOrder as any).litres) || 0;

    /* ---------------------------------------------------
       4) COMMON-SENSE SANITY CHECKS
       --------------------------------------------------- */

    // 4a) Minimum delivery size that "makes sense" to use for reminders
    //     (ignore tiny 1L test orders, etc.)
    //
    // Rules:
    //  - at least 10% of tank OR 500L, whichever is bigger
    //  - but never more than full tankSizeL
    const minValidDelivery = Math.min(
      tankSizeL,
      Math.max(tankSizeL * 0.1, 500)
    );

    // If the last delivery is smaller than that threshold, treat it as a test
    if (!rawDelivered || rawDelivered < minValidDelivery) {
      return res.status(200).json({
        ok: true,
        showReminder: false,
        message:
          "We only have a very small test delivery on record. Fuel reminders will start once we have a normal delivery to learn from.",
        contractTankSize: tankSizeL,
        contractMonthlyConsumption: monthlyUseL,
      });
    }

    // 4b) Clamp delivered litres so it never exceeds tank capacity
    const deliveredLitres = Math.min(rawDelivered, tankSizeL);

    /* ---------------------------------------------------
       5) Estimate tank level
       --------------------------------------------------- */

    const estimatedUsed = Math.max(dailyUseL * daysSince, 0);
    const estimatedLeft = Math.max(deliveredLitres - estimatedUsed, 0);

    const percentFull = tankSizeL
      ? Math.max(Math.min(estimatedLeft / tankSizeL, 1), 0)
      : 0;

    // 30% threshold for "running low"
    const threshold = 0.3;
    const showReminder = percentFull <= threshold;

    const percentDisplay = Math.round(percentFull * 100);

    const message = showReminder
      ? `Based on your last normal delivery and typical usage, your tank may be around ${percentDisplay}% full or lower. You may want to schedule a delivery.`
      : `Your estimated tank level is around ${percentDisplay}% full based on your recent usage.`;

    /* ---------------------------------------------------
       6) Respond
       --------------------------------------------------- */

    return res.status(200).json({
      ok: true,
      showReminder,
      message,
      percentFull,
      daysSinceLastDelivery: Math.round(daysSince * 10) / 10,
      estimatedLitresLeft: Math.round(estimatedLeft),
      contractTankSize: tankSizeL,
      contractMonthlyConsumption: monthlyUseL,
    });
  } catch (e: any) {
    console.error("usage reminder error", e);
    return res.status(500).json({
      ok: false,
      reason: e?.message || "Server error",
    });
  }
}

