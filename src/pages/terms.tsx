// src/pages/terms.tsx
// src/pages/terms.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import HCaptcha from "@hcaptcha/react-hcaptcha";

/** Update these for each revision */
const VERSION = "v1.2";
const LAST_UPDATED = "23 Sep 2025";

/** Company footer details (shown on web footer and in the print footer) */
const COMPANY = {
  name: "FuelFlow Ltd",
  regOffice: "123 Example Street, London, EC1A 1AA, United Kingdom",
  companyNo: "12345678",
  vatNo: "GB 123 4567 89",
  email: "support@fuelflow.co.uk",
  phone: "+44 (0)20 1234 5678",
  web: "https://fuelflow.co.uk",
};

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

  // small reader + fullscreen
  const readerRef = useRef<HTMLDivElement | null>(null);
  const [showFullscreen, setShowFullscreen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get("return");
    const e = params.get("email");
    if (r) setReturnTo(r.startsWith("/") ? r : "/client-dashboard");
    if (e) setEmail(e);
  }, []);

  // Track scroll position inside the reader window
  function onReaderScroll() {
    const el = readerRef.current;
    if (!el) return;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
    if (atBottom) setScrolledEnough(true);
  }

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

      const json = (await res.json()) as { id?: string };
      const ta = json?.id;

      setSubmitted(true);
      setCaptchaToken("");

      const ret =
        `${returnTo}?accepted=1` +
        (email ? `&email=${encodeURIComponent(email)}` : "") +
        (ta ? `&ta=${encodeURIComponent(ta)}` : "");

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
      {/* ---- Global print styles ---- */}
      <PrintStyles />

      {/* Brand background (screen only) */}
      <div className="absolute inset-0 bg-[#041F3E] print:hidden" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0B2344]/50 via-[#041F3E]/20 to-[#041F3E] print:hidden" />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 right-[-10%] opacity-[0.06] rotate-[-10deg] print:hidden"
      >
        <img src="/logo-email.png" alt="" className="w-[900px] max-w-none" />
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.08),transparent_55%)] print:hidden" />

      {/* ================= SCREEN LAYOUT ================= */}
      <div className="print:hidden">
        {/* Header */}
        <header className="relative z-10 border-b border-white/10 bg-white/[0.02] backdrop-blur-sm">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-4">
            <img src="/logo-email.png" alt="FuelFlow" className="h-8 w-auto" />
            <div className="ml-1 text-lg font-semibold">Terms & Conditions</div>

            <div className="ml-auto flex gap-2">
              <button
                onClick={() => window.print()}
                className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
                aria-label="Print Terms as PDF"
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

              {/* Reader window (small, scrollable) */}
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm text-white/70">
                  Please scroll to the end to enable <b>Accept</b>.
                </div>
                <button
                  className="rounded-lg bg-white/10 px-3 py-1.5 text-xs hover:bg-white/15"
                  onClick={() => setShowFullscreen(true)}
                  aria-label="Open fullscreen reader"
                >
                  Fullscreen
                </button>
              </div>

              <div
                ref={readerRef}
                onScroll={onReaderScroll}
                className="rounded-xl border border-white/10 bg-white/[0.04] p-4 max-h-[420px] overflow-y-auto prose prose-invert prose-p:leading-relaxed"
              >
                <LegalBody />
                <div className="h-6" />
              </div>

              {!scrolledEnough && (
                <div className="mt-3 text-xs text-white/60">
                  Keep scrolling the window above until you reach the end.
                </div>
              )}
            </article>

            {/* Accept Card */}
            <aside className="lg:col-span-4">
              <div className="sticky top-6 rounded-2xl border border-white/10 bg-white/[0.06] p-6 shadow-2xl backdrop-blur-sm">
                {!submitted ? (
                  <>
                    <h3 className="text-lg font-semibold mb-2">Accept these terms</h3>
                    <p className="text-sm text-white/80 mb-4">
                      You’ll need to scroll the terms (left) to the end, pass hCaptcha and tick the box.
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
                  href={COMPANY.web}
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

        {/* Professional footer (screen) */}
        <footer className="relative z-10 border-t border-white/10 bg-white/[0.02] backdrop-blur-sm">
          <div className="mx-auto max-w-6xl px-5 py-6 text-xs text-white/70 grid gap-1 md:grid-cols-3">
            <div>
              <div className="font-semibold text-white/80">{COMPANY.name}</div>
              <div>{COMPANY.regOffice}</div>
            </div>
            <div>
              <div>Company No: {COMPANY.companyNo}</div>
              <div>VAT No: {COMPANY.vatNo}</div>
            </div>
            <div>
              <div>
                Email:{" "}
                <a className="underline" href={`mailto:${COMPANY.email}`}>
                  {COMPANY.email}
                </a>
              </div>
              <div>Tel: {COMPANY.phone}</div>
              <div>
                Web:{" "}
                <a className="underline" href={COMPANY.web} target="_blank" rel="noreferrer">
                  {COMPANY.web}
                </a>
              </div>
            </div>
          </div>
        </footer>
      </div>

      {/* ================= PRINT-ONLY LAYOUT ================= */}
      <div className="hidden print:block text-black">
        {/* White background for print */}
        <div className="bg-white text-black">
          <div className="px-8 pt-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-black">FuelFlow Terms & Conditions</h1>
                <div className="text-sm text-black/80">
                  Version {VERSION} · Last updated {LAST_UPDATED}
                </div>
              </div>
              {/* Logo on print (optional – comment out if you don’t want it) */}
              <img src="/logo-email.png" alt="FuelFlow" style={{ height: 36 }} />
            </div>

            <TOCPrint />

            <div className="mt-4 text-[0.92rem] leading-6">
              <LegalBodyPrint />
            </div>

            {/* Print footer (not repeated on each page but rendered last) */}
            <div className="mt-10 pt-4 border-t border-black/20 text-[0.8rem] text-black/80">
              <div className="font-semibold text-black">{COMPANY.name}</div>
              <div>{COMPANY.regOffice}</div>
              <div>
                Company No: {COMPANY.companyNo} · VAT No: {COMPANY.vatNo}
              </div>
              <div>
                Email: {COMPANY.email} · Tel: {COMPANY.phone} · Web: {COMPANY.web}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Fullscreen reader (screen only) */}
      {showFullscreen && (
        <FullscreenReader onClose={() => setShowFullscreen(false)}>
          <LegalBody />
        </FullscreenReader>
      )}
    </div>
  );
}

/* -------------------------- Print CSS -------------------------- */

function PrintStyles() {
  return (
    <style jsx global>{`
      @media print {
        /* Improve legibility and layout for print */
        html,
        body {
          background: #fff !important;
          color: #000 !important;
        }
        a {
          color: #000;
          text-decoration: underline;
        }
        img {
          filter: none !important;
        }
      }
      /* Page margin + default size (A4 portrait) */
      @page {
        size: A4;
        margin: 18mm 16mm 18mm 16mm;
      }
      /* Page breaks before H2 to keep sections tidy */
      @media print {
        h2 {
          page-break-before: always;
        }
        h2:first-of-type {
          page-break-before: avoid;
        }
        /* Avoid breaking right after headings */
        h2 + p,
        h2 + ul,
        h2 + ol {
          page-break-before: avoid;
        }
      }
    `}</style>
  );
}

/* -------------------------- Components -------------------------- */

function TOC() {
  const items = tocItems();
  return (
    <nav className="mb-4 rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm">
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

/** Print TOC: black text, simple spacing */
function TOCPrint() {
  const items = tocItems();
  return (
    <nav>
      <div className="font-semibold text-black">Contents</div>
      <ol className="mt-1 grid grid-cols-2 gap-x-8 gap-y-1 text-[0.95rem] text-black list-decimal list-inside">
        {items.map(([id, label]) => (
          <li key={id}>{label}</li>
        ))}
      </ol>
    </nav>
  );
}

function tocItems(): ReadonlyArray<readonly [string, string]> {
  return [
    ["scope", "1. Scope & Definitions"],
    ["quotes", "2. Quotes, Pricing & Taxes"],
    ["orders", "3. Orders, Minimums & Credit"],
    ["delivery", "4. Delivery, Risk & Title"],
    ["responsibilities", "5. Client Responsibilities (Services/Works)"],
    ["tanks", "6. Tanks & Site Safety"],
    ["quality", "7. Product Quality & Measurement"],
    ["rebated", "8. Rebated Fuels, Duties & Legal Use"],
    ["payment", "9. Invoicing, Payment & Remedies"],
    ["liability", "10. Liability, Indemnities & Caps"],
    ["environment", "11. Environmental & Compliance"],
    ["rental", "12. Rental Tanks — Additional Terms"],
    ["data", "13. Data Protection & Communications"],
    ["suspension", "14. Suspension & Termination"],
    ["force", "15. Force Majeure"],
    ["misc", "16. Miscellaneous (incl. E-sign, Confidentiality, Notices, Law)"],
  ] as const;
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

/* ------------------- FULLSCREEN READER (screen) ------------------- */

function FullscreenReader({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm">
      <div className="absolute inset-0 p-4 md:p-8">
        <div className="mx-auto h-full max-w-5xl rounded-2xl border border-white/10 bg-[#0f172a] shadow-2xl flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <div className="text-sm font-semibold text-white/80">Terms — Fullscreen Reader</div>
            <button onClick={onClose} className="rounded-md bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15">
              Close
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 md:p-6 prose prose-invert max-w-none">{children}</div>
        </div>
      </div>
    </div>
  );
}

/* ------------------- LEGAL BODY (screen) ------------------- */

function LegalBody() {
  return (
    <div className="space-y-2 text-white/90">
      <IntroP />

      <Section id="scope" title="1. Scope & Definitions">
        <ul>
          <li>
            <strong>Business-to-business only.</strong> You warrant you act in the course of business and not as a consumer.
          </li>
          <li>
            <strong>Products</strong> are fuels and approved ancillary items. <strong>Services</strong> are only those we expressly agree in writing to provide.
          </li>
          <li>
            <strong>Refinery-linked price</strong> means a market-linked price derived from indices/wholesale quotes, adjusted for location, volume, duty/tax and logistics; it is not a guarantee of a specific refinery gate rate.
          </li>
          <li>These Terms prevail over your terms unless a FuelFlow authorised signatory agrees otherwise in writing.</li>
        </ul>
      </Section>

      <Section id="quotes" title="2. Quotes, Pricing & Taxes">
        <ul>
          <li>Quotes are invitations to treat and valid only for the period stated (or same business day if none).</li>
          <li>Prices are market-linked and may change up to acceptance and allocation by our suppliers/logistics.</li>
          <li>
            Unless stated otherwise, prices <em>exclude</em> VAT, duty, levies and statutory charges (added at the rate in force at the tax point).
          </li>
          <li>Extras may apply for timed windows, restricted access, waiting time, diversions, aborts, small drops, out-of-hours, or special compliance requests.</li>
          <li>If duty/tax rates or mandated specifications change between order and delivery, the invoiced price adjusts accordingly.</li>
        </ul>
      </Section>

      <Section id="orders" title="3. Orders, Minimums & Credit">
        <ul>
          <li>Orders are subject to our acceptance, stock availability, route scheduling, site safety and credit approval.</li>
          <li>Minimum order volumes may apply and vary by region/product/logistics.</li>
          <li>
            We may require prepayment/security and may refuse, cancel or suspend supply for exceeded credit limits, unverifiable details, suspected fraud, unsafe sites or your breach.
          </li>
          <li>
            Changes/cancellations within <strong>24 hours</strong> of the scheduled window may incur reasonable charges (haulage, restocking, lost time).
          </li>
        </ul>
      </Section>

      <Section id="delivery" title="4. Delivery, Risk & Title">
        <ul>
          <li>Delivery dates/windows are estimates; time is not of the essence.</li>
          <li>
            Risk passes on delivery into your tank/agreed point. <strong>Title</strong> passes only when we receive full cleared payment for that delivery and all other overdue sums (retention of title).
          </li>
          <li>
            You must ensure safe access, correct tank identification and sufficient ullage. Waiting time, diversions and aborts may be chargeable. We may refuse/suspend if the site is unsafe/non-compliant.
          </li>
          <li>If you instruct delivery to third-party tanks/locations, you remain liable and warrant authority to deliver.</li>
        </ul>
      </Section>

      <Section id="responsibilities" title="5. Client Responsibilities (Services/Works)">
        <ul>
          <li>
            Unless a separate signed contract says otherwise, <strong>you</strong> are solely responsible for tank installation/certification, hardstanding, electrical works, bunding, overfill/alarm systems, permits, operator training, routine maintenance and periodic inspection.
          </li>
          <li>Ensure competent supervision of deliveries and full site compliance with law, standards and manufacturer guidance.</li>
          <li>Any advice we give is general guidance only and does not shift your legal responsibilities as site operator.</li>
        </ul>
      </Section>

      <Section id="tanks" title="6. Tanks & Site Safety">
        <ul>
          <li>
            You are responsible for integrity and compliance of tanks, pipework and systems unless we supply/maintain equipment under a separate written agreement.
          </li>
          <li>
            Keep appropriate spill response equipment and a current spill plan on site. Notify us immediately of leaks, contamination, theft or incidents and cooperate with investigations.
          </li>
        </ul>
      </Section>

      <Section id="quality" title="7. Product Quality & Measurement">
        <ul>
          <li>
            Product conforms to the applicable specification <em>when it leaves our custody</em> (e.g., EN 590/BS 2869/EN 14214 as applicable), subject to industry tolerances.
          </li>
          <li>
            We are not responsible for contamination/degradation/loss after delivery (e.g., tank water, microbial growth, commingling, poor housekeeping).
          </li>
          <li>
            Quantities are determined by calibrated tanker meters or dip; reasonable tolerances apply. If disputing quantity, note on delivery note and notify us in writing within <strong>2 business days</strong>; quality disputes within <strong>7 business days</strong>. Preserve samples where practicable and allow inspection. Absent timely evidence, delivery docs are conclusive.
          </li>
        </ul>
      </Section>

      <Section id="rebated" title="8. Rebated Fuels, Duties & Legal Use">
        <ul>
          <li>
            If purchasing rebated products (e.g., gas oil/red diesel), you warrant you are legally entitled to use/possess them and will comply with HMRC rules and any other applicable law.
          </li>
          <li>
            You are solely responsible for duty declarations, licensing, record-keeping and any penalties. We may request proof of entitlement and suspend supply pending verification.
          </li>
        </ul>
      </Section>

      <Section id="payment" title="9. Invoicing, Payment & Remedies">
        <ul>
          <li>Unless agreed otherwise in writing, invoices are due on the date stated and payable in full without set-off or deduction.</li>
          <li>
            <strong>Late payment:</strong> interest accrues daily at the <em>greater of</em> (i) 4% per annum above Barclays Bank plc base rate or (ii) the statutory rate under the Late Payment of Commercial Debts (Interest) Act 1998, plus statutory fixed recovery costs and our reasonable collection/legal fees.
          </li>
          <li>We may adjust/withdraw credit limits, require prepayment/security, suspend deliveries and/or exercise a lien until amounts due are paid in full.</li>
          <li>
            <strong>Chargebacks/fraud:</strong> if payment is reversed or disputed after delivery, you remain liable for the full amount, interest and recovery costs unless the transaction was unauthorised due to our fault proven by competent evidence.
          </li>
        </ul>
      </Section>

      <Section id="liability" title="10. Liability, Indemnities & Caps">
        <ul>
          <li>Nothing excludes liability for death/personal injury caused by negligence, fraud or other liability that cannot lawfully be excluded.</li>
          <li>
            Subject to the foregoing, we are not liable for loss of profit, revenue, business, contracts, goodwill, production downtime, or any indirect/consequential loss.
          </li>
          <li>Subject to the foregoing, our total aggregate liability arising from or in connection with each order is limited to the price paid or payable for that order.</li>
          <li>
            You indemnify us against claims, losses and costs arising from your breach, unsafe/non-compliant site conditions, contamination/incidents after delivery, mis-use of rebated fuels, or third-party claims related to your storage/handling.
          </li>
        </ul>
      </Section>

      <Section id="environment" title="11. Environmental & Compliance">
        <ul>
          <li>
            You must comply with all laws, permits and industry codes governing storage/handling of fuels and hazardous substances, and maintain appropriate insurance.
          </li>
          <li>
            Any sustainability initiatives we run (e.g., offsets/planting) are discretionary and do not alter risk allocation or your legal responsibilities.
          </li>
        </ul>
      </Section>

      <Section id="rental" title="12. Rental Tanks — Additional Terms">
        <ul>
          <li>Rental equipment remains our property. You must insure it for full replacement value and follow usage instructions. Do not move/sublet/modify without written consent.</li>
          <li>
            “Free rental”/discounted rental (if offered) is conditional on minimum monthly volumes we specify; if not met, we may charge standard rental, recover costs, and/or remove equipment.
          </li>
          <li>
            On termination or breach, we may enter the site during business hours (or other safe agreed times) to repossess equipment and any residual product. You shall pay reasonable costs of uplift, cleaning and remediation.
          </li>
        </ul>
      </Section>

      <Section id="data" title="13. Data Protection & Communications">
        <ul>
          <li>
            We process personal data as a controller in accordance with our Privacy Notice (see website). Operational communications (service updates, safety notices) form part of the service.
          </li>
          <li>Marketing communications are sent only with a lawful basis; you may unsubscribe at any time.</li>
        </ul>
      </Section>

      <Section id="suspension" title="14. Suspension & Termination">
        <ul>
          <li>
            We may suspend/terminate supply immediately if: payment is overdue; credit concerns arise; the site is unsafe/non-compliant; illegality/suspected fraud; or material breach (not remedied within 7 days if remediable). You remain liable for all sums due.
          </li>
          <li>On termination, accrued rights and remedies survive, including our right to recover equipment and costs.</li>
        </ul>
      </Section>

      <Section id="force" title="15. Force Majeure">
        <p>
          Neither party is liable for failure or delay due to events beyond reasonable control (including shortages, strikes, extreme weather, acts of God, war, terrorism, epidemics, government action, regulatory changes impacting product availability/spec). Obligations are suspended while the event continues; each party will use reasonable endeavours to mitigate.
        </p>
      </Section>

      <Section id="misc" title="16. Miscellaneous (incl. E-sign, Confidentiality, Notices, Law)">
        <ul>
          <li>
            <strong>Confidentiality:</strong> Each party keeps the other’s non-public information confidential except where required by law/regulator.
          </li>
          <li>
            <strong>Entire Agreement:</strong> these Terms with your order/our acceptance and any signed variations are the entire agreement; you have not relied on statements not set out here.
          </li>
          <li>
            <strong>Variation:</strong> only effective if in writing and signed by an authorised FuelFlow signatory.
          </li>
          <li>
            <strong>Assignment:</strong> you may not assign without our consent; we may assign to an affiliate/financing party.
          </li>
          <li>
            <strong>Severance & Waiver:</strong> invalid provisions are severed; a failure to enforce is not a waiver.
          </li>
          <li>
            <strong>Notices:</strong> formal notices must be in writing to the registered address or notified email; deemed received when sent (email, absent bounce), on delivery (hand/courier), or 2 UK business days after posting.
          </li>
          <li>
            <strong>E-sign / Evidence:</strong> your electronic acceptance (checkbox/click/email), IP, user-agent, timestamp and version are admissible as evidence.
          </li>
          <li>
            <strong>Law & Jurisdiction:</strong> England & Wales law governs; courts of England & Wales have exclusive jurisdiction.
          </li>
        </ul>
      </Section>
    </div>
  );
}

/* ------------------- LEGAL BODY (print variant) ------------------- */

function LegalBodyPrint() {
  return (
    <div className="space-y-2 text-black">
      <IntroP print />

      <PrintSection title="1. Scope & Definitions">
        <ul>
          <li>
            <strong>Business-to-business only.</strong> You warrant you act in the course of business and not as a consumer.
          </li>
          <li>
            <strong>Products</strong> are fuels and approved ancillary items. <strong>Services</strong> are only those we expressly agree in writing to provide.
          </li>
          <li>
            <strong>Refinery-linked price</strong> means a market-linked price derived from indices/wholesale quotes, adjusted for location, volume, duty/tax and logistics; not a guarantee of a specific refinery gate rate.
          </li>
          <li>These Terms prevail over your terms unless a FuelFlow authorised signatory agrees otherwise in writing.</li>
        </ul>
      </PrintSection>

      <PrintSection title="2. Quotes, Pricing & Taxes">
        <ul>
          <li>Quotes are invitations to treat and valid only for the period stated (or same business day if none).</li>
          <li>Prices are market-linked and may change up to acceptance and allocation by suppliers/logistics.</li>
          <li>Unless stated otherwise, prices exclude VAT, duty, levies and statutory charges (added at the rate in force at the tax point).</li>
          <li>Extras may apply for timed windows, restricted access, waiting time, diversions, aborts, small drops, out-of-hours, or special compliance requests.</li>
          <li>If duty/tax rates or mandated specifications change between order and delivery, the invoiced price adjusts accordingly.</li>
        </ul>
      </PrintSection>

      <PrintSection title="3. Orders, Minimums & Credit">
        <ul>
          <li>Orders are subject to acceptance, stock availability, route scheduling, site safety and credit approval.</li>
          <li>Minimum order volumes may apply and vary by region/product/logistics.</li>
          <li>We may require prepayment/security and may refuse, cancel or suspend for exceeded credit limits, unverifiable details, suspected fraud, unsafe sites or breach.</li>
          <li>Changes/cancellations within 24 hours of the scheduled window may incur reasonable charges.</li>
        </ul>
      </PrintSection>

      <PrintSection title="4. Delivery, Risk & Title">
        <ul>
          <li>Delivery windows are estimates; time is not of the essence.</li>
          <li>
            Risk passes on delivery into your tank/agreed point. <strong>Title</strong> passes only when we receive full cleared payment for that delivery and all other overdue sums.
          </li>
          <li>
            You must ensure safe access, correct tank identification and sufficient ullage. Waiting time, diversions and aborts may be chargeable. We may refuse/suspend if the site is unsafe/non-compliant.
          </li>
          <li>If you instruct delivery to third-party tanks/locations, you remain liable and warrant authority.</li>
        </ul>
      </PrintSection>

      <PrintSection title="5. Client Responsibilities (Services/Works)">
        <ul>
          <li>
            Unless separately agreed, you are responsible for tank installation/certification, hardstanding, electrical works, bunding, overfill/alarm systems, permits, operator training, routine maintenance and periodic inspection.
          </li>
          <li>Ensure competent supervision of deliveries and site compliance.</li>
          <li>Any advice is general guidance only and does not shift your legal responsibilities.</li>
        </ul>
      </PrintSection>

      <PrintSection title="6. Tanks & Site Safety">
        <ul>
          <li>
            You are responsible for integrity and compliance of tanks, pipework and systems unless we supply/maintain equipment under a separate written agreement.
          </li>
          <li>Maintain spill response equipment and a current spill plan; notify incidents immediately and cooperate with investigations.</li>
        </ul>
      </PrintSection>

      <PrintSection title="7. Product Quality & Measurement">
        <ul>
          <li>Product conforms to the applicable specification when it leaves our custody (e.g., EN 590/BS 2869/EN 14214), subject to tolerances.</li>
          <li>No liability for contamination/degradation/loss after delivery (water, microbes, commingling, housekeeping).</li>
          <li>
            Quantities by calibrated meters/dip; tolerances apply. Quantity disputes within 2 business days; quality disputes within 7 business days; preserve samples; documents otherwise conclusive.
          </li>
        </ul>
      </PrintSection>

      <PrintSection title="8. Rebated Fuels, Duties & Legal Use">
        <ul>
          <li>For rebated products (e.g., gas oil/red diesel) you warrant lawful entitlement and HMRC compliance.</li>
          <li>You are solely responsible for duty declarations, licensing, records and penalties. We may request proof and suspend pending verification.</li>
        </ul>
      </PrintSection>

      <PrintSection title="9. Invoicing, Payment & Remedies">
        <ul>
          <li>Invoices are due as stated and payable in full without set-off/deduction.</li>
          <li>
            Late payment: interest at the greater of 4% p.a. above Barclays base or statutory rate under the Late Payment Act, plus recovery costs and reasonable legal fees.
          </li>
          <li>We may alter credit limits, require prepayment/security, suspend deliveries and/or exercise a lien until paid.</li>
          <li>Chargebacks/fraud: reversal after delivery leaves you liable unless unauthorised due to our fault proven by competent evidence.</li>
        </ul>
      </PrintSection>

      <PrintSection title="10. Liability, Indemnities & Caps">
        <ul>
          <li>Nothing excludes liability for death/personal injury due to negligence, fraud, or non-excludable liabilities.</li>
          <li>No liability for loss of profit, revenue, business, goodwill, downtime or consequential loss.</li>
          <li>Aggregate liability per order limited to the price paid/payable for that order.</li>
          <li>
            You indemnify us for losses arising from your breach, unsafe/non-compliant conditions, post-delivery contamination/incidents, mis-use of rebated fuels, and third-party claims related to your storage/handling.
          </li>
        </ul>
      </PrintSection>

      <PrintSection title="11. Environmental & Compliance">
        <ul>
          <li>Comply with all laws, permits and codes for storage/handling of fuels/hazardous substances; maintain appropriate insurance.</li>
          <li>Sustainability initiatives are discretionary and do not alter responsibilities or risk allocation.</li>
        </ul>
      </PrintSection>

      <PrintSection title="12. Rental Tanks — Additional Terms">
        <ul>
          <li>Rental equipment remains our property; insure for full replacement; follow usage instructions; no move/sublet/modify without consent.</li>
          <li>
            Free/discounted rental conditional on minimum monthly volumes; failing which we may charge standard rental, recover costs, and/or remove equipment.
          </li>
          <li>
            On termination/breach we may repossess during business hours (or safe agreed times); you pay reasonable uplift/cleaning/remediation costs.
          </li>
        </ul>
      </PrintSection>

      <PrintSection title="13. Data Protection & Communications">
        <ul>
          <li>
            We process personal data per our Privacy Notice. Operational communications (service updates, safety) form part of the service.
          </li>
          <li>Marketing sent only with a lawful basis; you may unsubscribe at any time.</li>
        </ul>
      </PrintSection>

      <PrintSection title="14. Suspension & Termination">
        <ul>
          <li>
            We may suspend/terminate for overdue payment, credit concerns, unsafe/non-compliant sites, illegality/suspected fraud, or unremedied material breach (7 days if remediable).
          </li>
          <li>Accrued rights/remedies survive, including recovery of equipment and costs.</li>
        </ul>
      </PrintSection>

      <PrintSection title="15. Force Majeure">
        <p>
          No liability for failure/delay due to events beyond reasonable control (shortages, strikes, extreme weather, acts of God, war, terrorism, epidemics, government action, regulatory changes). Obligations suspended during the event; parties will mitigate.
        </p>
      </PrintSection>

      <PrintSection title="16. Miscellaneous (incl. E-sign, Confidentiality, Notices, Law)">
        <ul>
          <li>
            <strong>Confidentiality:</strong> each party keeps the other’s non-public info confidential except where required by law/regulator.
          </li>
          <li>
            <strong>Entire Agreement:</strong> these Terms with order/acceptance and signed variations are the entire agreement.
          </li>
          <li>
            <strong>Variation:</strong> only if in writing signed by an authorised FuelFlow signatory.
          </li>
          <li>
            <strong>Assignment:</strong> you may not assign without consent; we may assign to an affiliate/financing party.
          </li>
          <li>
            <strong>Severance/Waiver:</strong> invalid provisions are severed; failure to enforce is not a waiver.
          </li>
          <li>
            <strong>Notices:</strong> to registered address or notified email; deemed received on sending (email, absent bounce), on delivery (hand/courier), or 2 UK business days after posting.
          </li>
          <li>
            <strong>E-sign / Evidence:</strong> electronic acceptance (checkbox/click/email), IP, user-agent, timestamp and version are admissible as evidence.
          </li>
          <li>
            <strong>Law & Jurisdiction:</strong> England & Wales law; exclusive jurisdiction of England & Wales courts.
          </li>
        </ul>
      </PrintSection>
    </div>
  );
}

/* ------------------- Shared intro paragraph ------------------- */

function IntroP({ print = false }: { print?: boolean }) {
  return (
    <p className={print ? "text-black/80" : "text-sm text-white/70"}>
      These Terms & Conditions (“Terms”) govern the supply of fuel and any ancillary items by
      FuelFlow Ltd (“FuelFlow”, “we”, “us”) to business customers (“Customer”, “you”). By placing an
      order, accepting delivery, opening an account or clicking “Accept Terms”, you agree to these Terms.
    </p>
  );
}

/* ------------------- Helpers for print sections ------------------- */

function PrintSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="break-before-page">
      <h2 className="mt-6 mb-1 text-xl font-semibold text-black">{title}</h2>
      <div className="text-black">{children}</div>
    </section>
  );
}

/* ------------------- Accepted card ------------------- */

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

