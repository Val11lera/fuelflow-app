// src/pages/checkout/cancel.tsx
// src/pages/checkout/cancel.tsx
import Link from "next/link";
import { useRouter } from "next/router";

export default function CancelPage() {
  const { query } = useRouter();
  const orderId = (query.orderId as string) || "";

  return (
    <main className="min-h-screen relative overflow-hidden bg-[#061B34] text-white">
      <div className="absolute inset-0 bg-gradient-to-b from-[#2a2a2a0a] to-[#041F3E]" />
      <section className="relative z-10 mx-auto max-w-2xl px-5 py-16 md:py-20">
        <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-6 sm:p-8 shadow-2xl backdrop-blur">
          <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-orange-400 to-amber-500 text-[#041F3E] ring-8 ring-amber-400/20">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>

          <h1 className="text-center text-3xl md:text-4xl font-extrabold tracking-tight">
            Checkout cancelled
          </h1>
          <p className="mt-2 text-center text-white/70">
            No charge has been made. You can return and try again.
          </p>

          {orderId && (
            <p className="mt-3 text-center text-white/60 text-sm">
              Order reference: <code className="bg-black/30 px-2 py-1 rounded">{orderId}</code>
            </p>
          )}

          <div className="mt-6 flex justify-center">
            <Link
              href="/order"
              className="inline-flex items-center justify-center rounded-2xl bg-yellow-500 px-5 py-3 font-semibold text-[#041F3E] shadow hover:bg-yellow-400 focus:outline-none focus:ring focus:ring-yellow-500/30"
            >
              Back to Order
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
