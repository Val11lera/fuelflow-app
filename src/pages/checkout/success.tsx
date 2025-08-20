// src/pages/checkout/success.tsx
import type { GetServerSideProps } from "next";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

type OrderRow = {
  id: string;
  fuel: "petrol" | "diesel";
  litres: number;
  unit_price: number;          // £ per litre captured at order time
  total_amount_pence: number;  // integer pence for Stripe
  status: string;
  created_at: string;
};

type Props =
  | { ok: false; reason: string }
  | {
      ok: true;
      session: {
        id: string;
        payment_status: string | null;
        amount_total: number | null;
        currency: string | null;
        customer_email: string | null;
        order_id: string | null;
      };
      order: OrderRow | null;
    };

export const getServerSideProps: GetServerSideProps<Props> = async ({ query }) => {
  const sessionId = query.session_id as string | undefined;
  if (!sessionId) {
    return { props: { ok: false, reason: "Missing session_id" } };
  }

  // 1) Stripe: retrieve the Checkout Session (expand PI so we can read metadata there too)
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
    apiVersion: "2024-06-20",
  });

  try {
    const s = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent"],
    });

    const pi =
      (typeof s.payment_intent === "object" && s.payment_intent) || null;

    const orderId =
      (s.metadata && (s.metadata.order_id as string)) ||
      ((pi as Stripe.PaymentIntent | null)?.metadata?.order_id as string) ||
      null;

    // 2) (Optional but nice) fetch the order from Supabase to show details
    let order: OrderRow | null = null;
    if (orderId) {
      const admin = createClient(
        process.env.SUPABASE_URL as string,
        process.env.SUPABASE_SERVICE_ROLE_KEY as string
      );
      const { data } = await admin
        .from("orders")
        .select(
          "id,fuel,litres,unit_price,total_amount_pence,status,created_at"
        )
        .eq("id", orderId)
        .maybeSingle();
      order = (data as unknown as OrderRow) ?? null;
    }

    return {
      props: {
        ok: true,
        session: {
          id: s.id,
          payment_status: s.payment_status,
          amount_total: s.amount_total,
          currency: s.currency,
          customer_email: s.customer_details?.email ?? null,
          order_id: orderId,
        },
        order,
      },
    };
  } catch (e: any) {
    return { props: { ok: false, reason: e.message || "Could not load session" } };
  }
};

function moneyPence(p?: number | null, currency = "GBP") {
  if (typeof p !== "number") return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(p / 100);
}

export default function SuccessPage(props: Props) {
  if (!props.ok) {
    return (
      <main className="min-h-screen bg-gray-900 text-white p-8">
        <h1 className="text-2xl font-semibold mb-2">Thanks!</h1>
        <p className="text-red-400 mb-6">We couldn’t load your session: {props.reason}</p>
        <a
          href="/checkout"
          className="inline-block bg-yellow-500 text-black px-4 py-2 rounded"
        >
          Back to Checkout
        </a>
      </main>
    );
  }

  const { session, order } = props;
  const amount = moneyPence(session.amount_total, session.currency ?? "GBP");

  return (
    <main className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-2xl mx-auto bg-gray-800 rounded-xl p-6 shadow-lg">
        <h1 className="text-3xl font-bold text-green-400 mb-4">Payment successful 🎉</h1>

        <div className="space-y-1 text-gray-200">
          <p><span className="text-gray-400">Session:</span> {session.id}</p>
          <p><span className="text-gray-400">Status:</span> {session.payment_status}</p>
          <p><span className="text-gray-400">Amount:</span> {amount}</p>
          <p><span className="text-gray-400">Email:</span> {session.customer_email ?? "—"}</p>
          {session.order_id && (
            <p><span className="text-gray-400">Order ID:</span> {session.order_id}</p>
          )}
        </div>

        {order && (
          <div className="mt-6 border-t border-gray-700 pt-4">
            <h2 className="text-xl font-semibold mb-3">Order details</h2>
            <ul className="space-y-1 text-gray-200">
              <li><span className="text-gray-400">Fuel:</span> {order.fuel}</li>
              <li><span className="text-gray-400">Litres:</span> {order.litres}</li>
              <li>
                <span className="text-gray-400">Unit price (captured):</span>{" "}
                £{order.unit_price.toFixed(3)} / litre
              </li>
              <li>
                <span className="text-gray-400">Total:</span>{" "}
                {moneyPence(order.total_amount_pence, "GBP")}
              </li>
              <li>
                <span className="text-gray-400">Order status:</span> {order.status}
              </li>
            </ul>
          </div>
        )}

        <div className="mt-8 flex gap-3">
          <a
            href="/client-dashboard"
            className="bg-yellow-500 text-black px-4 py-2 rounded hover:bg-yellow-400"
          >
            Go to Dashboard
          </a>
          <a
            href="/order"
            className="bg-gray-700 px-4 py-2 rounded hover:bg-gray-600"
          >
            Place another order
          </a>
        </div>
      </div>
    </main>
  );
}

