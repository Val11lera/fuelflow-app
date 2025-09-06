// src/pages/checkout/success.tsx
// src/pages/checkout/success.tsx
import Link from "next/link";
import { useRouter } from "next/router";

export default function SuccessPage() {
  const router = useRouter();
  const { orderId, session_id } = router.query as { orderId?: string; session_id?: string };

  return (
    <main className="min-h-screen bg-[#061B34] text-white flex items-center justify-center p-6">
      <div className="max-w-xl w-full rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
        <h1 className="text-3xl font-bold mb-2">Thanks!</h1>
        {!session_id ? (
          <p className="text-red-300 mb-4">
            We couldn’t load your session: Missing <code>session_id</code>.
          </p>
        ) : (
          <p className="text-white/80 mb-4">
            Your payment session <code>{session_id}</code> completed.
          </p>
        )}
        {orderId && (
          <p className="text-white/70 mb-4">
            Order reference: <code>{orderId}</code>
          </p>
        )}

        <div className="flex items-center justify-center gap-3">
          <Link
            href="/order"
            className="rounded-xl bg-yellow-500 px-4 py-2 font-semibold text-[#041F3E] hover:bg-yellow-400"
          >
            Back to Order
          </Link>
          <a
            href="https://dashboard.stripe.com/test/payments"
            target="_blank"
            rel="noreferrer"
            className="rounded-xl bg-white/10 px-4 py-2 hover:bg-white/15"
          >
            View in Stripe (test)
          </a>
        </div>
      </div>
    </main>
  );
}

