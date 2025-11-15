// src/pages/checkout/success.tsx
// src/pages/checkout/success.tsx
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";

/** Nicely shorten long tokens like Stripe IDs */
function ellipsize(id?: string, left = 10, right = 8) {
  if (!id) return "—";
  if (id.length <= left + right + 3) return id;
  return `${id.slice(0, left)}…${id.slice(-right)}`;
}

export default function SuccessPage() {
  const { query } = useRouter();
  const orderId = (query.orderId as string) || "";
  const sessionId = (query.session_id as string) || "";

  const [copied, setCopied] = useState<"session" | "order" | null>(null);
  const sessionShort = useMemo(() => ellipsize(sessionId), [sessionId]);
  const orderShort = useMemo(() => ellipsize(orderId), [orderId]);

  // quick celebratory pulse on load
  useEffect(() => {
    const t = setTimeout(() => {
      setCopied(null);
    }, 1500);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy(text: string, which: "session" | "order") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
    } catch {}
  }

  return (
    <main className="min-h-screen relative overflow-hidden bg-[#061B34] text-white">
      {/* subtle brandy background */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0B274B] via-[#061B34] to-[#041F3E]" />
      <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(ellipse_at_center,rgba(255,255,255,.08),transparent_60%)]" />

      {/* confetti-ish sparkles */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.15] [background-image:repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(255,255,255,.5)_10px,rgba(255,255,255,.5)_12px)]" />

      <section className="relative z-10 mx-auto max-w-2xl px-5 py-16 md:py-20">
        {/* Badge + Title */}
        <div className="mx-auto w-full rounded-3xl border border-white/10 bg-white/[0.06] p-6 sm:p-8 shadow-2xl backdrop-blur">
          {/* Animated check */}
          <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-green-500 text-[#041F3E] shadow-lg ring-8 ring-emerald-400/20 animate-[pop_700ms_ease-out]">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M20 6L9 17l-5-5"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <h1 className="text-center text-3xl md:text-4xl font-extrabold tracking-tight">
            Thanks! Payment received ✅
          </h1>
          <p className="mt-2 text-center text-white/70">
            We’ve confirmed your payment and saved your order details.
          </p>

          {/* Details card */}
          <div className="mt-6 grid gap-3 rounded-2xl border border-white/10 bg-[#0B274B]/60 p-4 sm:p-5">
            <Row
              label="Payment session"
              value={sessionShort}
              fullValue={sessionId}
              onCopy={() => copy(sessionId, "session")}
              copied={copied === "session"}
            />
            <Row
              label="Order reference"
              value={orderShort}
              fullValue={orderId}
              onCopy={() => copy(orderId, "order")}
              copied={copied === "order"}
            />
            <div className="mt-1 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">
              You’ll receive an email receipt from Stripe. A FuelFlow invoice/dispatch confirmation
              will follow shortly.
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 flex justify-center">
            <Link
              href="/order"
              className="inline-flex items-center justify-center rounded-2xl bg-yellow-500 px-5 py-3 font-semibold text-[#041F3E] shadow hover:bg-yellow-400 focus:outline-none focus:ring focus:ring-yellow-500/30"
            >
              Back to Order
            </Link>
          </div>

          {/* small note */}
          <p className="mt-4 text-center text-xs text-white/50">
            Tip: tap the copy icons to grab IDs if you need support.
          </p>
        </div>
      </section>

      {/* keyframes */}
      <style jsx global>{`
        @keyframes pop {
          0% {
            transform: scale(0.7);
            opacity: 0;
          }
          60% {
            transform: scale(1.06);
            opacity: 1;
          }
          100% {
            transform: scale(1);
          }
        }
      `}</style>
    </main>
  );
}

function Row({
  label,
  value,
  fullValue,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  fullValue: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-white/70">{label}</div>
      <div className="flex items-center gap-2">
        <code className="rounded-lg bg-black/30 px-2 py-1 text-[13px]">{value}</code>
        <button
          type="button"
          onClick={onCopy}
          className="rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-xs text-white/80 hover:bg-white/10 focus:outline-none focus:ring focus:ring-white/15"
          aria-label={`Copy ${label}`}
          title={`Copy ${label}`}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
        <span className="sr-only">{fullValue}</span>
      </div>
    </div>
  );
}
