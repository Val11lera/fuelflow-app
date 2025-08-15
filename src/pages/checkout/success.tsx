// src/pages/checkout/success.tsx
import type { GetServerSideProps } from "next";
import Stripe from "stripe";

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
      };
    };

export const getServerSideProps: GetServerSideProps<Props> = async ({ query }) => {
  const sessionId = query.session_id as string | undefined;
  if (!sessionId) {
    return { props: { ok: false, reason: "Missing session_id" } };
  }

  // Server-side Stripe call (safe to use secret here)
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
    apiVersion: "2024-06-20",
  });

  try {
    const s = await stripe.checkout.sessions.retrieve(sessionId);

    return {
      props: {
        ok: true,
        session: {
          id: s.id,
          payment_status: s.payment_status,
          amount_total: s.amount_total,
          currency: s.currency,
          customer_email: (s.customer_details && s.customer_details.email) || null,
        },
      },
    };
  } catch (e: any) {
    return { props: { ok: false, reason: e.message || "Could not load session" } };
  }
};

export default function SuccessPage(props: Props) {
  if (!props.ok) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Thanks!</h1>
        <p>We couldn’t load your session: {props.reason}</p>
        <a href="/checkout/test">Back</a>
      </main>
    );
  }

  const { session } = props;
  const amount =
    session.amount_total != null && session.currency
      ? `${(session.amount_total / 100).toFixed(2)} ${session.currency.toUpperCase()}`
      : "—";

  return (
    <main style={{ padding: 24 }}>
      <h1>Payment successful 🎉</h1>
      <p><strong>Session:</strong> {session.id}</p>
      <p><strong>Status:</strong> {session.payment_status}</p>
      <p><strong>Amount:</strong> {amount}</p>
      <p><strong>Email:</strong> {session.customer_email ?? "—"}</p>
      <p><a href="/checkout/test">Make another test payment</a></p>
    </main>
  );
}
