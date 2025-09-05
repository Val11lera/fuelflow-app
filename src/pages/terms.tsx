// src/pages/terms.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import HCaptcha from "@hcaptcha/react-hcaptcha";

const VERSION = "v1.1";            // bump when you change terms text
const LAST_UPDATED = "30 Aug 2025"; // show on the page

export default function TermsPage() {
  const [checked, setChecked] = useState(false);
  const [scrolledEnough, setScrolledEnough] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // optional acceptance metadata
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  // where to return after acceptance
  const [returnTo, setReturnTo] = useState<string>("/client-dashboard");

  // hCaptcha
  const [captchaToken, setCaptchaToken] = useState<string>("");

  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get("return");
    const e = params.get("email");
    if (r) setReturnTo(r.startsWith("/") ? r : "/client-dashboard");
    if (e) setEmail(e);

    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((x) => x.isIntersecting)) setScrolledEnough(true);
      },
      { threshold: 0.25 }
    );
    if (endRef.current) obs.observe(endRef.current);
    return () => obs.disconnect();
  }, []);

  const acceptEnabled = useMemo(
    () => checked && scrolledEnough && !!captchaToken && !submitting && !submitted,
    [checked, scrolledEnough, captchaToken, submitting, submitted]
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
          captchaToken,
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `Failed (${res.status})`);
      }

      setSubmitted(true);
      setCaptchaToken("");

      // auto-return with flags so /order can unlock the checkbox & restore email
      const ret = `${returnTo}?accepted=1${email ? `&email=${encodeURIComponent(email)}` : ""}`;
      setTimeout(() => {
        window.location.href = ret;
      }, 900);
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
            <button
              onClick={() => window.print()}
              className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
            >
              Print / Save PDF
            </button>
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
        </div>

        {/* two-column layout */}
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
                    Please read the terms. You’ll need to scroll near the end, pass hCaptcha and tick
                    the box before accepting.
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

                  {!scrolledEnough && (
                    <div className="mb-3 rounded-lg border border-white/10 bg-white/[0.06] p-2 text-xs text-white/70">
                      Scroll to the end of the terms to enable the Accept button.
                    </div>
                  )}

                  <div className="mb-3">
                    <HCaptcha
                      sitekey={process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY || ""}
                      onVerify={(t) => setCaptchaToken(t)}
                      onExpire={() => setCaptchaToken("")}
                      onClose={() => setCaptchaToken("")}
                      theme="dark"
                    />
                  </div>

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
                    By accepting, you enter into a binding agreement with FuelFlow. IP and user-agent
                    are recorded to evidence acceptance.
                  </p>
                </>
              ) : (
                <AcceptedCard returnTo={returnTo} />
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
                href={returnTo}
              >
                Back to previous page
              </a>
            </div>
          </aside>
        </div>
      </main>

      <footer className="relative z-10 border-t border-white/10 bg-white/[0.02] backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-5 py-4 text-xs text-white/60">
          © {new Date().getFullYear()} FuelFlow. This template is provided for convenience and does
          not constitute legal advice; please seek solicitor review.
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
    ["responsibilities", "5. Client Responsibilities (Services/Works)"],
    ["tanks", "6. Tanks & Site Safety"],
    ["quality", "7. Product Quality & Measurement"],
    ["payment", "8. Invoicing, Payment & Remedies"],
    ["liability", "9. Liability, Indemnities & Caps"],
    ["environment", "10. Environmental & Compliance"],
    ["rental", "11. Rental Tanks — Additional Terms"],
    ["data", "12. Data Protection & Communications"],
    ["suspension", "13. Suspension & Termination"],
    ["force", "14. Force Majeure"],
    ["law", "15. Law & Jurisdiction"],
    ["misc", "16. Miscellaneous"],
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
    <section id={id} className="prose prose-invert max-w-none prose-p:leading-relaxed">
      <h2 className="mt-8">{title}</h2>
      <div>{children}</div>
    </section>
  );
}

/* ------------------- LEGAL BODY (full text) ------------------- */

function LegalBody() {
  return (
    <div className="space-y-2 text-white/90">
      <p className="text-sm text-white/70">
        These Terms & Conditions (the “Terms”) govern the supply of fuel and any ancillary items by
        FuelFlow (“Supplier”, “we”, “us”) to the customer (“Customer”, “you”). By placing an order,
        opening an account, accepting delivery or clicking “Accept Terms”, you agree to be bound by
        these Terms.
      </p>

      <Section id="scope" title="1. Scope & Definitions">
        <ul>
          <li>
            <strong>Supply Scope.</strong> FuelFlow supplies <em>fuel only</em>. Any installation,
            commissioning, maintenance, repair, electrical or civil works, site preparation, spill
            response equipment and ongoing site compliance are the Customer’s sole responsibility,
            unless a separate, signed agreement expressly states FuelFlow will provide such services.
          </li>
          <li>
            <strong>Products</strong> are fuels and any approved ancillary items we sell.{" "}
            <strong>Services</strong> means any services we agree in writing to provide separately.
          </li>
          <li>
            These Terms take precedence over your terms unless an authorised FuelFlow signatory
            agrees otherwise in writing.
          </li>
        </ul>
      </Section>

      <Section id="quotes" title="2. Quotes, Pricing & Taxes">
        <ul>
          <li>
            Prices are market-linked and may vary by delivery location, volume and credit status.
            Quotes are invitations to treat and valid only for the period stated.
          </li>
          <li>
            Unless stated otherwise, prices exclude any applicable taxes, duties and levies (added at
            the rate in force at the tax point).
          </li>
          <li>
            Extra charges may apply for timed windows, out-of-hours deliveries, restricted access,
            waiting time, aborted deliveries or special compliance requests.
          </li>
        </ul>
      </Section>

      <Section id="orders" title="3. Orders, Minimums & Credit">
        <ul>
          <li>
            Orders are subject to acceptance, stock availability, credit approval and site safety
            verification. Minimum order volumes may apply (including where rental equipment is
            offered).
          </li>
          <li>
            We may require prepayment or security. We may cancel or suspend supply if credit limits
            are exceeded or payments are overdue.
          </li>
        </ul>
      </Section>

      <Section id="delivery" title="4. Delivery, Risk & Title">
        <ul>
          <li>
            Delivery dates are estimates. Risk passes upon physical delivery into your tank or agreed
            point. Title passes on receipt of full cleared payment.
          </li>
          <li>
            You must ensure safe, unobstructed access, correct tank identification and sufficient
            ullage. Waiting time, diversions and aborts may be chargeable.
          </li>
        </ul>
      </Section>

      <Section
        id="responsibilities"
        title="5. Client Responsibilities (Services/Works are Customer’s Responsibility)"
      >
        <ul>
          <li>
            Unless a separate signed contract states otherwise, <strong>you</strong> are solely
            responsible for: tank installation and certification, hardstanding, electrical works,
            bunding, overfill/alarm/sensor systems, permits, operator training, routine maintenance
            and periodic inspection.
          </li>
          <li>
            You must ensure competent persons supervise all deliveries and that your site complies
            with current law, standards and manufacturer guidance.
          </li>
          <li>
            Any advice we give is for general guidance only and does not shift legal responsibility
            from you as site operator.
          </li>
        </ul>
      </Section>

      <Section id="tanks" title="6. Tanks & Site Safety">
        <ul>
          <li>
            You are responsible for the integrity and compliance of your tanks, pipework and associated
            systems unless we supply and maintain equipment under a separate written agreement.
          </li>
          <li>
            You must keep appropriate spill response equipment on site and maintain a current spill
            plan. We may refuse/suspend delivery if the site is unsafe or non-compliant.
          </li>
        </ul>
      </Section>

      <Section id="quality" title="7. Product Quality & Measurement">
        <ul>
          <li>
            Product conforms to the applicable specification when it leaves our custody. We are not
            responsible for contamination, degradation or loss occurring after delivery.
          </li>
          <li>
            Quantities are determined by tanker meters or calibrated dip; reasonable tolerances apply.
          </li>
        </ul>
      </Section>

      <Section id="payment" title="8. Invoicing, Payment & Remedies">
        <ul>
          <li>
            Unless otherwise agreed in writing, payment is due by the date stated on the invoice.
            Interest accrues daily on overdue sums at 4% per annum above Barclays Bank plc base rate.
          </li>
          <li>
            We may withhold or suspend deliveries, adjust credit limits, charge collection costs and
            exercise a lien over goods until amounts due are paid in full.
          </li>
          <li>
            You agree to reimburse our reasonable costs (including legal fees) incurred in recovering
            overdue sums, repossessing rental equipment, or enforcing these Terms.
          </li>
        </ul>
      </Section>

      <Section id="liability" title="9. Liability, Indemnities & Caps">
        <ul>
          <li>
            Nothing excludes liability for death/personal injury caused by negligence, fraud, or any
            liability that cannot lawfully be excluded.
          </li>
          <li>
            Subject to the foregoing, we are not liable for loss of profit, revenue, use, contracts,
            goodwill, business interruption, or any indirect/consequential loss.
          </li>
          <li>
            Our total aggregate liability arising from or in connection with each order is limited to
            the price paid for that order.
          </li>
          <li>
            You indemnify us against claims, losses and costs arising from your breach, unsafe or
            non-compliant site conditions, contamination after delivery, or environmental incidents
            caused by your acts/omissions.
          </li>
        </ul>
      </Section>

      <Section id="environment" title="10. Environmental & Compliance">
        <ul>
          <li>
            You must comply with all laws, permits and industry codes relating to storage and handling,
            and immediately notify us of incidents. We may suspend supply if we consider a site unsafe.
          </li>
          <li>
            Any sustainability initiatives we run (e.g., tree planting) are discretionary and do not
            alter your legal responsibilities.
          </li>
        </ul>
      </Section>

      <Section id="rental" title="11. Rental Tanks — Additional Terms">
        <ul>
          <li>
            Rental tanks remain our property at all times. You must insure them for full replacement
            value and follow our usage instructions. You may not move or modify rental equipment
            without our written consent.
          </li>
          <li>
            Where a “free rental” model is offered, it is conditional on minimum monthly volumes as
            notified by us. If minimums are not met, we may charge the rental fee, recover our costs
            and/or remove equipment.
          </li>
          <li>
            On termination or breach, we may enter the site during business hours (or at other safe,
            agreed times) to repossess rental equipment and any residual product. You shall pay
            reasonable costs of uplift, cleaning and remediation. Our rights here are in addition to
            any other remedies (including a claim for damages).
          </li>
        </ul>
      </Section>

      <Section id="data" title="12. Data Protection & Communications">
        <ul>
          <li>
            We process personal data in accordance with our Privacy Notice. Operational communications
            (service updates, safety notices) form part of the service.
          </li>
          <li>
            For marketing emails, you can opt-in and unsubscribe at any time.
          </li>
        </ul>
      </Section>

      <Section id="suspension" title="13. Suspension & Termination">
        <ul>
          <li>
            We may suspend or terminate supply immediately for non-payment, credit concerns, safety
            issues, suspected illegality or material breach. You remain liable for all sums due.
          </li>
          <li>
            Upon termination, accrued rights and remedies survive, including our right to recover
            equipment and costs.
          </li>
        </ul>
      </Section>

      <Section id="force" title="14. Force Majeure">
        <p>
          Neither party is liable for failure or delay caused by events beyond its reasonable control,
          including but not limited to shortages, strikes, extreme weather, acts of God, war or
          governmental action. Obligations are suspended for the duration of the event.
        </p>
      </Section>

      <Section id="law" title="15. Law & Jurisdiction">
        <p>
          These Terms and any dispute (including non-contractual disputes) are governed by the laws
          of England and Wales. The courts of England and Wales shall have exclusive jurisdiction.
        </p>
      </Section>

      <Section id="misc" title="16. Miscellaneous">
        <ul>
          <li>
            Entire Agreement: these Terms, together with any order confirmation and signed variations,
            constitute the entire agreement and supersede prior discussions.
          </li>
          <li>
            Variation: effective only if signed by an authorised FuelFlow signatory.
          </li>
          <li>
            Assignment: you may not assign without our consent; we may assign to an affiliate.
          </li>
          <li>
            Severance: if a provision is held invalid, the remainder remains in force.
          </li>
          <li>
            Waiver: a failure to enforce is not a waiver.
          </li>
          <li>
            Third-party Rights: no person other than the parties has rights under the Contracts
            (Rights of Third Parties) Act 1999.
          </li>
          <li>
            E-sign / Evidence: your electronic acceptance, IP, user-agent, time stamp and version are
            admissible as evidence of acceptance.
          </li>
        </ul>
      </Section>
    </div>
  );
}

function AcceptedCard({ returnTo }: { returnTo: string }) {
  return (
    <div className="text-center">
      <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-green-500/20 text-green-300">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h4 className="text-lg font-semibold">Thanks — terms accepted</h4>
      <p className="mt-1 text-sm text-white/70">
        Returning to <code className="text-white/80">{returnTo}</code>…
      </p>
    </div>
  );
}

