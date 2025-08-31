// src/pages/order.tsx
// src/pages/order.tsx
import { useEffect, useMemo, useState } from "react";

/* ----------------------------- Utilities ----------------------------- */

function fmtGBP(n: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
  }).format(n);
}

const TERMS_LS_KEY = "ff_terms_accepted_v2";

/* --------------------------- Page Component -------------------------- */

export default function OrderPage() {
  // Pricing & form state (adjust these as needed)
  const [fuel, setFuel] = useState<"diesel" | "petrol">("diesel");
  const [litres, setLitres] = useState<number>(1000);
  const unitPetrol = 0.46; // example
  const unitDiesel = 0.49; // example
  const unitPrice = useMemo(() => (fuel === "diesel" ? unitDiesel : unitPetrol), [fuel]);
  const total = useMemo(() => litres * unitPrice, [litres, unitPrice]);

  // Terms acceptance flow
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  // Load persisted acceptance
  useEffect(() => {
    try {
      setAcceptedTerms(localStorage.getItem(TERMS_LS_KEY) === "1");
    } catch {}
  }, []);
  // Persist on change
  useEffect(() => {
    try {
      localStorage.setItem(TERMS_LS_KEY, acceptedTerms ? "1" : "0");
    } catch {}
  }, [acceptedTerms]);

  const payDisabled = !acceptedTerms;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!acceptedTerms) return;
    // TODO: hand off to Stripe or your API here.
    alert("Proceeding to payment… (wire your Stripe/API here)");
  }

  return (
    <main className="min-h-screen bg-[#071B33] text-white">
      {/* Header bar (right-aligned back link) */}
      <div className="mx-auto flex w-full max-w-6xl items-center justify-end px-4 pt-6">
        <a href="/client-dashboard" className="text-sm text-white/80 hover:text-white">
          Back to Dashboard
        </a>
      </div>

      {/* Main container */}
      <section className="mx-auto w-full max-w-6xl px-4">
        <h1 className="mt-2 text-3xl font-bold">Place an Order</h1>

        {/* Price cards */}
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card title="Petrol (95)" value={`${fmtGBP(unitPetrol)} `} suffix="/ litre" />
          <Card title="Diesel" value={`${fmtGBP(unitDiesel)} `} suffix="/ litre" />
          <Card title="Estimated Total" value={fmtGBP(total)} />
        </div>

        {/* Order form */}
        <form onSubmit={onSubmit} className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Fuel">
              <select
                value={fuel}
                onChange={(e) => setFuel(e.target.value as "diesel" | "petrol")}
                className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none"
              >
                <option value="diesel">Diesel</option>
                <option value="petrol">Petrol (95)</option>
              </select>
            </Field>

            <Field label="Litres">
              <input
                type="number"
                min={1}
                value={litres}
                onChange={(e) => setLitres(parseInt(e.target.value || "0", 10))}
                className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none"
              />
            </Field>

            <Field label="Delivery date">
              <input
                type="date"
                className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none"
              />
            </Field>

            <Field label="Your email (receipt)">
              <input
                type="email"
                className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none"
                defaultValue="fuelflow.queries@gmail.com"
              />
            </Field>

            <Field className="md:col-span-2" label="Full name">
              <input className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none" />
            </Field>

            <Field label="Address line 1">
              <input className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none" />
            </Field>

            <Field label="Address line 2">
              <input className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none" />
            </Field>

            <Field label="Postcode">
              <input className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none" />
            </Field>

            <Field label="City">
              <input className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none" />
            </Field>
          </div>

          {/* Terms + CTA */}
          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <label className="inline-flex items-center gap-3 text-sm text-white/80">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="h-4 w-4 accent-yellow-500"
              />
              <span>
                I agree to the{" "}
                <button
                  type="button"
                  onClick={() => setShowTerms(true)}
                  className="underline underline-offset-4 hover:text-white"
                >
                  Terms &amp; Conditions
                </button>
                .
              </span>
            </label>

            <button
              type="submit"
              disabled={payDisabled}
              className={`rounded-xl px-5 py-2 font-semibold ${
                payDisabled
                  ? "cursor-not-allowed bg-yellow-500/50 text-[#041F3E]"
                  : "bg-yellow-500 text-[#041F3E] hover:bg-yellow-400"
              }`}
            >
              Pay with Stripe
            </button>
          </div>
        </form>

        {/* Clean footer */}
        <footer className="flex items-center justify-center py-10 text-sm text-white/60">
          © {new Date().getFullYear()} FuelFlow. All rights reserved.
        </footer>
      </section>

      {/* Terms modal */}
      <TermsModal
        open={showTerms}
        onClose={() => setShowTerms(false)}
        onAccept={() => setAcceptedTerms(true)}
      />
    </main>
  );
}

/* ------------------------------ Sub-components ------------------------------ */

function Card({ title, value, suffix }: { title: string; value: string; suffix?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <h3 className="text-white/80">{title}</h3>
      <p className="mt-2 text-2xl font-bold">
        {value} {suffix ? <span className="text-base font-normal text-white/70">{suffix}</span> : null}
      </p>
    </div>
  );
}

function Field({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm text-white/80">{label}</span>
      {children}
    </label>
  );
}

/* ----------------------------- Terms Modal UI ----------------------------- */

function TermsModal({
  open,
  onClose,
  onAccept,
}: {
  open: boolean;
  onClose: () => void;
  onAccept: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-[101] w-[min(960px,92vw)] max-h-[86vh] overflow-hidden rounded-2xl border border-white/10 bg-[#0E2E57] shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-white/10 bg-[#0A2446]">
          <img src="/logo-email.png" alt="FuelFlow" className="h-7 w-auto" />
          <h2 className="text-lg font-semibold text-white">FuelFlow — Terms & Conditions</h2>
          <button
            onClick={onClose}
            className="ml-auto rounded-lg px-3 py-1.5 text-white/70 hover:bg-white/10"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto p-6">
          <TermsContent />
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-3 border-t border-white/10 px-6 py-4 bg-[#0A2446]">
          <button
            onClick={onClose}
            className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-white/90 hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onAccept();
              onClose();
            }}
            className="rounded-xl bg-yellow-500 px-4 py-2 font-semibold text-[#041F3E] hover:bg-yellow-400"
          >
            I Accept
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------- Terms Content Text --------------------------- */

function TermsContent() {
  return (
    <div className="space-y-6 text-sm leading-6">
      <section>
        <h3 className="text-base font-semibold text-white">1. Definitions & Scope</h3>
        <p className="text-white/80">
          “Company”, “we”, “us”, or “FuelFlow” means FuelFlow Ltd. “Customer”, “you” means the
          purchasing entity. “Products” means petroleum products (e.g., petrol, diesel). “Services”
          means ancillary services we may offer (e.g., arranging deliveries, tank installation via
          approved partners). These Terms govern all quotations, orders, deliveries, and any rental
          of tanks or equipment supplied by or through FuelFlow.
        </p>
      </section>

      <section>
        <h3 className="text-base font-semibold text-white">2. Supply of Fuel & Customer Responsibilities</h3>
        <ul className="list-disc pl-5 text-white/80 space-y-2">
          <li>
            We supply fuel on the terms herein. You are responsible for ensuring your premises and
            tanks are suitable, compliant, and safe to accept deliveries (including access routes,
            tank integrity, venting, overfill protection, and any required permits).
          </li>
          <li>
            You must provide accurate delivery information and ensure a representative is present if
            required by the carrier. Any failed delivery or waiting time costs due to site issues may
            be charged to you.
          </li>
          <li>
            You are responsible for ongoing tank inspections, leak prevention, spill response, and
            compliance with all applicable laws and standards.
          </li>
        </ul>
      </section>

      <section>
        <h3 className="text-base font-semibold text-white">3. Pricing, Orders & Payment</h3>
        <ul className="list-disc pl-5 text-white/80 space-y-2">
          <li>
            Prices are quoted per litre and may vary with market conditions until an order is
            confirmed. Taxes and duties (if applicable) are in addition to the quoted price.
          </li>
          <li>
            Payment terms are as stated at checkout or agreed in writing. We may suspend deliveries
            for late or overdue balances and charge interest on overdue sums to the maximum permitted by law.
          </li>
          <li>
            Estimates are based on quantity and location assumptions; final invoice may reflect meter
            readings or bill of lading volumes actually delivered.
          </li>
        </ul>
      </section>

      <section>
        <h3 className="text-base font-semibold text-white">4. Title, Risk & Delivery</h3>
        <ul className="list-disc pl-5 text-white/80 space-y-2">
          <li>
            Risk passes on delivery to your tank; title passes once payment is received in full
            (retention of title). If payment is not received, we may recover products or pursue legal remedies.
          </li>
          <li>
            Delivery dates are estimates; we are not liable for delays caused by carriers, traffic, weather,
            or events beyond our control (force majeure).
          </li>
        </ul>
      </section>

      <section>
        <h3 className="text-base font-semibold text-white">5. Rented Tanks & Equipment</h3>
        <ul className="list-disc pl-5 text-white/80 space-y-2">
          <li>
            Rented tanks/equipment remain our (or our partner’s) property. You must use them only for
            FuelFlow supplies, keep them in good condition, and insure them for loss or damage.
          </li>
          <li>
            You are liable for misuse, negligence, contamination, overfills, or damage. On termination,
            you must allow collection in good order and pay applicable removal or remediation costs.
          </li>
          <li>
            Breach of rental terms may entitle us to immediate recovery of the equipment and damages.
          </li>
        </ul>
      </section>

      <section>
        <h3 className="text-base font-semibold text-white">6. Safety, Environment & Indemnity</h3>
        <ul className="list-disc pl-5 text-white/80 space-y-2">
          <li>
            You must ensure safe access and a safe working environment for deliveries. You will
            indemnify FuelFlow for losses arising from unsafe conditions, site contamination, or
            environmental incidents caused by your acts/omissions.
          </li>
          <li>
            You must immediately notify relevant authorities of any spill where required and take
            prompt remedial action.
          </li>
        </ul>
      </section>

      <section>
        <h3 className="text-base font-semibold text-white">7. Warranties & Limitation of Liability</h3>
        <ul className="list-disc pl-5 text-white/80 space-y-2">
          <li>
            Products will conform to standard specifications at the time of delivery. Except as
            required by law, all other warranties are excluded.
          </li>
          <li>
            Our liability is limited to the price of the relevant delivery or, in the case of rented
            equipment, to direct losses reasonably foreseeable and proven. We exclude liability for
            indirect or consequential loss (e.g., loss of profits, business interruption).
          </li>
        </ul>
      </section>

      <section>
        <h3 className="text-base font-semibold text-white">8. Compliance</h3>
        <p className="text-white/80">
          You agree to comply with all applicable laws, including anti-bribery, modern slavery,
          data protection, and sanctions regulations. We may suspend service if we reasonably suspect non-compliance.
        </p>
      </section>

      <section>
        <h3 className="text-base font-semibold text-white">9. Termination</h3>
        <p className="text-white/80">
          We may terminate or suspend supplies for non-payment, safety concerns, material breach, or
          insolvency. On termination, all sums become immediately due and any rented equipment must
          be returned promptly.
        </p>
      </section>

      <section>
        <h3 className="text-base font-semibold text-white">10. Governing Law</h3>
        <p className="text-white/80">
          These Terms are governed by the laws of England & Wales. The courts of England shall have
          exclusive jurisdiction.
        </p>
      </section>
    </div>
  );
}



