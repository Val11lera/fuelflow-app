// src/pages/terms.tsx
// src/pages/terms.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const VERSION = "v1.0";            // bump when you update terms
const LAST_UPDATED = "29 Aug 2025"; // show on the page

export default function TermsPage() {
  const [checked, setChecked] = useState(false);
  const [scrolledEnough, setScrolledEnough] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Optional metadata to store with acceptance (e.g., from email confirmation/quote)
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  // Optional linking (e.g., /terms?ticket_id=abc&source=quote)
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);

  // track scroll near end of document to enable Accept button
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setTicketId(params.get("ticket_id"));
    setSource(params.get("source"));

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting);
        if (visible) setScrolledEnough(true);
      },
      { rootMargin: "0px", threshold: 0.2 }
    );
    if (endRef.current) observer.observe(endRef.current);
    return () => observer.disconnect();
  }, []);

  const acceptEnabled = useMemo(
    () => checked && scrolledEnough && !submitting && !submitted,
    [checked, scrolledEnough, submitting, submitted]
  );

  async function onAccept() {
    try {
      setSubmitting(true);
      setError(null);

      const res = await fetch("/api/terms-accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: VERSION,
          name: name || null,
          email: email || null,
          ticket_id: ticketId,
          source,
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `Failed (${res.status})`);
      }
      setSubmitted(true);
    } catch (e: any) {
      setError(e?.message || "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen text-white relative overflow-x-hidden">
      {/* Brand background */}
      <div className="absolute inset-0 bg-[#041F3E]" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0B2344]/50 via-[#041F3E]/20 to-[#041F3E]" />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 right-[-10%] opacity-[0.06] rotate-[-10deg]"
      >
        <img src="/logo-email.png" alt="" className="w-[900px] max-w-none" />
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.08),transparent_55%)]" />

      {/* Header */}
      <header className="relative z-10 border-b border-white/10 bg-white/[0.02] backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-4">
          <img src="/logo-email.png" alt="FuelFlow" className="h-8 w-auto" />
          <div className="ml-1 text-lg font-semibold">Terms & Conditions</div>

          <div className="ml-auto flex gap-2">
            <a
              href="https://fuelflow.co.uk"
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
            >
              Back to fuelflow.co.uk
            </a>
            <a
              href="/quote"
              className="rounded-lg bg-yellow-500 px-3 py-2 text-sm font-semibold text-[#041F3E] hover:bg-yellow-400"
            >
              Go to Quote
            </a>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-5 py-8 md:py-10">
        {/* Title Row */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">FuelFlow Terms & Conditions</h1>
            <p className="text-white/70">
              Version {VERSION} · Last updated {LAST_UPDATED}
            </p>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={() => window.print()}
              className="rounded-lg bg-white/10 px-3 py-2 hover:bg-white/15"
            >
              Print / Save PDF
            </button>
          </div>
        </div>

        {/* 2-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Content */}
          <article className="lg:col-span-8 rounded-2xl border border-white/10 bg-white/[0.05] p-6 md:p-8 shadow-2xl backdrop-blur-sm">
            <TOC />
            <LegalBody />
            <div ref={endRef} className="mt-2" />
          </article>

          {/* Accept Card */}
          <aside className="lg:col-span-4">
            <div className="sticky top-6 rounded-2xl border border-white/10 bg-white/[0.06] p-6 shadow-2xl backdrop-blur-sm">
              {!submitted ? (
                <>
                  <h3 className="text-lg font-semibold mb-2">Accept these terms</h3>
                  <p className="text-sm text-white/80 mb-4">
                    Please read the terms. You’ll need to scroll near the end and tick the box
                    before accepting.
                  </p>

                  <div className="flex gap-2 mb-3">
                    <input
                      id="accept"
                      type="checkbox"
                      className="accent-yellow-500 mt-1"
                      checked={checked}
                      onChange={(e) => setChecked(e.target.checked)}
                    />
                    <label htmlFor="accept" className="text-sm">
                      I confirm I have read and agree to FuelFlow’s Terms & Conditions.
                    </label>
                  </div>

                  <div className="mb-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-white/70 mb-1">Your name (optional)</label>
                      <input
                        className="w-full rounded-lg border border-white/10 bg-white/[0.06] p-2 text-sm placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Jane Smith"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-white/70 mb-1">Email (optional)</label>
                      <input
                        type="email"
                        className="w-full rounded-lg border border-white/10 bg-white/[0.06] p-2 text-sm placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@company.com"
                      />
                    </div>
                  </div>

                  {/* Status helper */}
                  {!scrolledEnough && (
                    <div className="mb-3 rounded-lg border border-white/10 bg-white/[0.06] p-2 text-xs text-white/70">
                      Scroll to the end of the terms to enable the Accept button.
                    </div>
                  )}

                  {error && (
                    <div className="mb-3 rounded-lg border border-red-400/40 bg-red-500/10 p-2 text-sm text-red-200">
                      {error}
                    </div>
                  )}

                  <button
                    disabled={!acceptEnabled}
                    onClick={onAccept}
                    className="w-full rounded-xl bg-yellow-500 py-2.5 font-semibold text-[#041F3E]
                               hover:bg-yellow-400 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {submitting ? "Saving…" : "Accept Terms"}
                  </button>

                  <p className="mt-3 text-xs text-white/60">
                    By accepting, you enter into a binding agreement with FuelFlow for any current
                    or future supply. IP and user-agent are recorded to evidence acceptance.
                  </p>
                </>
              ) : (
                <AcceptedCard />
              )}
            </div>

            {/* Quick links */}
            <div className="mt-4 grid grid-cols-1 gap-2">
              <a
                className="rounded-lg bg-white/10 px-3 py-2 text-center hover:bg-white/15"
                href="https://fuelflow.co.uk"
                target="_blank"
                rel="noreferrer"
              >
                Back to fuelflow.co.uk
              </a>
              <a
                className="rounded-lg bg-yellow-500 px-3 py-2 text-center font-semibold text-[#041F3E] hover:bg-yellow-400"
                href="/quote"
              >
                Go to Quote
              </a>
            </div>
          </aside>
        </div>
      </main>

      <footer className="relative z-10 border-t border-white/10 bg-white/[0.02] backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-5 py-4 text-xs text-white/60">
          © {new Date().getFullYear()} FuelFlow. This template is provided for convenience
          and does not constitute legal advice; please seek independent legal review.
        </div>
      </footer>
    </div>
  );
}

/* -------------------------- Components -------------------------- */

function TOC() {
  const items = [
    ["scope", "1. Scope & Definitions"],
    ["quotes", "2. Quotes, Pricing & Taxes"],
    ["orders", "3. Orders, Minimums & Credit"],
    ["delivery", "4. Delivery, Risk & Title"],
    ["tanks", "5. Tanks, Safety & Site Access"],
    ["quality", "6. Product Quality & Measurement"],
    ["payment", "7. Invoicing & Payment"],
    ["liability", "8. Liability, Limits & Indemnities"],
    ["environment", "9. Environmental & Compliance"],
    ["rental", "10. Rental Tanks (if applicable)"],
    ["data", "11. Data Protection & Communications"],
    ["termination", "12. Suspension & Termination"],
    ["force", "13. Force Majeure"],
    ["law", "14. Law & Jurisdiction"],
    ["misc", "15. Miscellaneous"],
  ] as const;

  return (
    <nav className="mb-6 rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm">
      <div className="mb-2 font-semibold">Contents</div>
      <ol className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 list-decimal list-inside">
        {items.map(([id, label]) => (
          <li key={id}>
            <a className="text-yellow-300 hover:underline" href={`#${id}`}>
              {label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="prose prose-invert max-w-none prose-headings:scroll-mt-24">
      <h2 className="mt-8">{title}</h2>
      <div className="prose-p:leading-relaxed">{children}</div>
    </section>
  );
}

function LegalBody() {
  return (
    <div className="space-y-2 text-white/90">
      <p className="text-sm text-white/70">
        These Terms & Conditions (the “Terms”) apply to the supply of fuels, equipment and related
        services by FuelFlow (“Supplier”, “we”, “us”) to the customer (“Customer”, “you”). By placing
        an order, opening an account, accepting delivery or clicking “Accept Terms”, you agree to be
        bound by these Terms.
      </p>

      <Section id="scope" title="1. Scope & Definitions">
        <ul>
          <li>
            <strong>Products</strong> means fuels and any ancillary items provided by us.
          </li>
          <li>
            <strong>Services</strong> include transport, installation, maintenance, tank rental and
            logistics support.
          </li>
          <li>
            <strong>Business Day</strong> means Monday–Friday excluding public holidays in England.
          </li>
          <li>
            These Terms prevail over your purchase terms unless expressly agreed in writing by an
            authorised FuelFlow signatory.
          </li>
        </ul>
      </Section>

      <Section id="quotes" title="2. Quotes, Pricing & Taxes">
        <ul>
          <li>
            Prices are dynamic and depend on market conditions, delivery location, volume and credit
            status. Quotes are invitations to treat and valid only for the time specified.
          </li>
          <li>
            Unless we state otherwise, prices exclude duties and any applicable taxes or levies
            (which will be added at the rate in force at the tax point).
          </li>
          <li>
            Surcharges may apply for timed windows, out-of-hours deliveries, access constraints or
            extraordinary events beyond our control.
          </li>
        </ul>
      </Section>

      <Section id="orders" title="3. Orders, Minimums & Credit">
        <ul>
          <li>
            Orders are subject to acceptance, stock availability, credit checks and site safety
            verification. Minimum order volumes may apply (including for any free rental model).
          </li>
          <li>
            We may require prepayment or security. We may cancel or suspend if credit limits are
            exceeded or payments fall overdue.
          </li>
        </ul>
      </Section>

      <Section id="delivery" title="4. Delivery, Risk & Title">
        <ul>
          <li>
            Delivery dates are estimates. Risk passes on physical delivery into your tank or other
            agreed point. Title passes when we receive full cleared payment.
          </li>
          <li>
            You must ensure safe, unobstructed access for an appropriate vehicle, accurate tank
            identification and that ullage is sufficient. Waiting time, aborts and diversions may be
            chargeable.
          </li>
        </ul>
      </Section>

      <Section id="tanks" title="5. Tanks, Safety & Site Access">
        <ul>
          <li>
            You are responsible for the integrity, compliance and maintenance of your tanks, pipework
            and associated systems unless we supply and maintain them under a separate agreement.
          </li>
          <li>
            You must keep adequate spill response equipment on site and ensure competent persons
            supervise deliveries.
          </li>
        </ul>
      </Section>

      <Section id="quality" title="6. Product Quality & Measurement">
        <ul>
          <li>
            Product meets the applicable British or OEM specification when it leaves our custody.
            Sampling must be performed in accordance with industry practice. We will not be liable
            for contamination or degradation arising after delivery.
          </li>
          <li>
            Quantities are determined by tanker meters or calibrated dip; reasonable tolerances
            apply.
          </li>
        </ul>
      </Section>

      <Section id="payment" title="7. Invoicing & Payment">
        <ul>
          <li>
            Unless otherwise agreed in writing, payment is due by the date shown on the invoice.
            Interest may be charged on overdue sums at 4% per annum above Barclays Bank plc base
            rate, accruing daily.
          </li>
          <li>
            We may set-off amounts owed by you against sums due to you.
          </li>
        </ul>
      </Section>

      <Section id="liability" title="8. Liability, Limits & Indemnities">
        <ul>
          <li>
            Nothing limits liability for death/personal injury caused by negligence, fraud or any
            other liability that cannot be lawfully excluded.
          </li>
          <li>
            Subject to the foregoing, we are not liable for loss of profit, business, goodwill,
            interruption, or any indirect or consequential loss.
          </li>
          <li>
            Our aggregate liability arising out of each order shall not exceed the price paid for the
            relevant order.
          </li>
          <li>
            You indemnify us against claims, costs and losses arising from your breach, unsafe site
            conditions, or environmental incidents caused by your acts/omissions.
          </li>
        </ul>
      </Section>

      <Section id="environment" title="9. Environmental & Compliance">
        <ul>
          <li>
            You must comply with all laws, permits and industry standards relating to fuel storage and
            handling and promptly notify us of incidents. We may suspend supply if we consider a site
            unsafe or non-compliant.
          </li>
          <li>
            We may operate sustainability initiatives (e.g., tree planting) on a discretionary basis;
            such initiatives do not alter your legal responsibilities.
          </li>
        </ul>
      </Section>

      <Section id="rental" title="10. Rental Tanks (if applicable)">
        <ul>
          <li>
            If we provide a rental tank, it remains our property. You must insure it for full
            replacement value and use it only for approved products. You must not move or modify it
            without consent.
          </li>
          <li>
            Rental is conditional on minimum monthly volumes (as notified). If minimums are not met,
            we may charge the rental fee or remove the tank.
          </li>
          <li>
            On termination, you must give us safe access to uplift the tank and any residual product.
          </li>
        </ul>
      </Section>

      <Section id="data" title="11. Data Protection & Communications">
        <ul>
          <li>
            We process personal data in accordance with our Privacy Notice. Operational emails,
            service updates and safety notices form part of the service.
          </li>
          <li>
            For marketing emails you can opt-in and unsubscribe at any time.
          </li>
        </ul>
      </Section>

      <Section id="termination" title="12. Suspension & Termination">
        <ul>
          <li>
            We may suspend or terminate supply for non-payment, credit concerns, safety issues or
            breach of these Terms. You remain liable for sums due.
          </li>
        </ul>
      </Section>

      <Section id="force" title="13. Force Majeure">
        <p>
          Neither party is liable for failure or delay caused by events beyond its reasonable control,
          including but not limited to shortages, strikes, extreme weather, acts of God, war or
          governmental action.
        </p>
      </Section>

      <Section id="law" title="14. Law & Jurisdiction">
        <p>
          These Terms and any dispute or claim (including non-contractual disputes) shall be governed
          by the laws of England and Wales. The courts of England and Wales shall have exclusive
          jurisdiction.
        </p>
      </Section>

      <Section id="misc" title="15. Miscellaneous">
        <ul>
          <li>
            Entire Agreement: these Terms together with any order confirmation and written variations
            constitute the entire agreement.
          </li>
          <li>
            Variation: changes are effective only if signed by an authorised FuelFlow signatory.
          </li>
          <li>
            Severance: if a term is held invalid, the remainder remains in force.
          </li>
          <li>
            Assignment: you may not assign without our consent.
          </li>
          <li>
            Third-party rights: no person other than the parties has rights under the Contracts
            (Rights of Third Parties) Act 1999.
          </li>
        </ul>
      </Section>
    </div>
  );
}

function AcceptedCard() {
  return (
    <div className="text-center">
      <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-green-500/20 text-green-300">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h4 className="text-lg font-semibold">Thanks — terms accepted</h4>
      <p className="mt-1 text-sm text-white/70">
        We’ve recorded your acceptance. You can proceed to place an order.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <a
          className="rounded-lg bg-yellow-500 px-3 py-2 font-semibold text-[#041F3E] hover:bg-yellow-400"
          href="/quote"
        >
          Go to Quote
        </a>
        <a
          className="rounded-lg bg-white/10 px-3 py-2 hover:bg-white/15"
          href="https://fuelflow.co.uk"
          target="_blank"
          rel="noreferrer"
        >
          Back to fuelflow.co.uk
        </a>
      </div>
    </div>
  );
}

