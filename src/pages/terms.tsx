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

      const qp = new URLSearchParams();
      qp.set("accepted", "1");
      if (email) qp.set("email", email);
      if (ta) qp.set("ta", ta);

      const ret = `${returnTo}?${qp.toString()}`;

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
        {items.map(([_, label]) => (
          <li key={label}>{label}</li>
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

      {/* ... keep your existing sections exactly as in your current code ... */}
      {/* (omitted here for brevity; use the body from your current message) */}
    </div>
  );
}

/* ------------------- LEGAL BODY (print variant) ------------------- */

function LegalBodyPrint() {
  return (
    <div className="space-y-2 text-black">
      <IntroP print />
      {/* ... keep your print sections exactly as in your current code ... */}
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

