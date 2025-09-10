// src/pages/documents.tsx
// src/pages/documents.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/* =========================
   Types & Setup
   ========================= */

type ContractStatus = "draft" | "signed" | "approved" | "cancelled";
type TankOption = "buy" | "rent";

const TERMS_VERSION = "v1.1";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

type ContractRow = {
  id: string;
  email: string | null;
  customer_name?: string | null;
  tank_option: TankOption;
  status: ContractStatus;
  signed_at: string | null;
  approved_at: string | null;
  created_at: string;

  company_name?: string | null;
  company_number?: string | null;
  vat_number?: string | null;

  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;

  reg_address_line1?: string | null;
  reg_address_line2?: string | null;
  reg_city?: string | null;
  reg_postcode?: string | null;
  reg_country?: string | null;

  site_address_line1?: string | null;
  site_address_line2?: string | null;
  site_city?: string | null;
  site_postcode?: string | null;
  site_country?: string | null;

  tank_size_l?: number | null;
  monthly_consumption_l?: number | null;
  market_price_gbp_l?: number | null;
  fuelflow_price_gbp_l?: number | null;
  capex_gbp?: number | null;

  signature_name?: string | null;

  signed_pdf_path?: string | null;
  approved_pdf_path?: string | null;

  terms_acceptance_id?: string | null; // link to terms
};

type PriceRow = { fuel: string; total_price: number; price_date?: string | null };

function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/* =========================
   Page
   ========================= */

export default function DocumentsPage() {
  const [userEmail, setUserEmail] = useState<string>("");
  const [termsAccepted, setTermsAccepted] = useState<boolean>(false);

  const [buyLatest, setBuyLatest] = useState<ContractRow | null>(null);
  const [rentLatest, setRentLatest] = useState<ContractRow | null>(null);

  // prices (for calculator defaults)
  const [petrolPrice, setPetrolPrice] = useState<number | null>(null);
  const [dieselPrice, setDieselPrice] = useState<number | null>(null);

  // modals (signing)
  const [showBuy, setShowBuy] = useState(false);
  const [showRent, setShowRent] = useState(false);

  // ROI only modal
  const [showCalc, setShowCalc] = useState<{ open: boolean; option: TankOption | null }>({
    open: false,
    option: null,
  });

  // status guide as OVERLAY (bottom sheet)
  const [showGuide, setShowGuide] = useState(false);

  // capture TA id from query
  const [taFromQuery, setTaFromQuery] = useState<string | null>(null);

  // ---------- load ----------
  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        window.location.href = "/login";
        return;
      }
      const emailLower = (auth.user.email || "").toLowerCase();
      setUserEmail(emailLower);

      const p = new URLSearchParams(window.location.search);
      const ta = p.get("ta");
      setTaFromQuery(ta || null);

      const { data: t } = await supabase
        .from("terms_acceptances")
        .select("id")
        .eq("email", emailLower)
        .eq("version", TERMS_VERSION)
        .limit(1);
      setTermsAccepted(!!t?.length);

      await reloadContracts(emailLower);
      await loadLatestPrices();
    })();
  }, []);

  async function reloadContracts(emailLower: string = userEmail) {
    if (!emailLower) return;
    const { data } = await supabase
      .from("contracts")
      .select("*")
      .eq("email", emailLower)
      .order("created_at", { ascending: false });

    const rows = (data || []) as ContractRow[];
    const latestBuy = rows.find((r) => r.tank_option === "buy") ?? null;
    const latestRent = rows.find((r) => r.tank_option === "rent") ?? null;

    setBuyLatest(latestBuy);
    setRentLatest(latestRent);
  }

  // prices loader with fallbacks
  async function loadLatestPrices() {
    const tryLoad = async (table: string) => {
      try {
        const { data } = await supabase.from(table).select("fuel,total_price,price_date");
        return (data || []) as PriceRow[];
      } catch {
        return [];
      }
    };

    let rows: PriceRow[] = [];
    rows = rows.length ? rows : await tryLoad("latest_prices");
    rows = rows.length ? rows : await tryLoad("latest_fuel_prices_view");
    rows = rows.length ? rows : await tryLoad("latest_prices_view");

    if (!rows.length) {
      try {
        const { data } = await supabase
          .from("daily_prices")
          .select("fuel,total_price,price_date")
          .order("price_date", { ascending: false })
          .limit(200);
        rows = (data || []) as PriceRow[];
      } catch {}
    }

    if (rows?.length) {
      const seen = new Map<string, PriceRow>();
      for (const r of rows) {
        const f = (r.fuel || "").toLowerCase();
        if (!seen.has(f)) seen.set(f, r);
      }
      for (const r of Array.from(seen.values())) {
        if ((r.fuel || "").toLowerCase() === "petrol") setPetrolPrice(Number(r.total_price));
        if ((r.fuel || "").toLowerCase() === "diesel") setDieselPrice(Number(r.total_price));
      }
    }
  }

  const docsComplete =
    termsAccepted &&
    ((buyLatest && buyLatest.status === "approved") || (rentLatest && rentLatest.status === "approved"));

  // Mobile sticky CTA logic
  const mobileCta = useMemo(() => {
    if (docsComplete) {
      return { label: "Order Fuel", href: "/order", onClick: undefined as any };
    }
    if (!termsAccepted) {
      return {
        label: "Accept Terms",
        href: `/terms?return=/documents&email=${encodeURIComponent(userEmail)}`,
        onClick: undefined as any,
      };
    }
    if (!buyLatest?.id && !rentLatest?.id) {
      return { label: "Start Buy Contract", href: undefined, onClick: () => setShowBuy(true) };
    }
    if ((buyLatest?.status as any) !== "approved" && (rentLatest?.status as any) !== "approved") {
      return { label: "Complete Contract", href: undefined, onClick: () => (rentLatest ? setShowRent(true) : setShowBuy(true)) };
    }
    return null;
  }, [docsComplete, termsAccepted, userEmail, buyLatest, rentLatest]);

  // Small checklist for quick read
  const checklist: { label: string; ok: boolean }[] = [
    { label: "Terms", ok: termsAccepted },
    { label: "Buy Active", ok: buyLatest?.status === "approved" },
    { label: "Rent Active", ok: rentLatest?.status === "approved" },
  ];

  return (
    <div className="min-h-screen bg-[#0b1220] text-white pt-[env(safe-area-inset-top)]">
      {/* Header */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 mb-6">
        <div className="flex items-center gap-3">
          <a href="/client-dashboard" className="rounded-lg bg-white/10 p-2 hover:bg-white/15 md:hidden" aria-label="Back">
            <BackIcon className="h-5 w-5" />
          </a>
          <img src="/logo-email.png" alt="FuelFlow" className="h-7 w-auto hidden md:block" />
          <h1 className="text-xl font-bold sm:text-2xl">Documents</h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-medium hover:bg-white/[0.1]"
            onClick={() => setShowGuide(true)}
          >
            Status guide
          </button>
          <a href="/client-dashboard" className="hidden rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15 md:inline-block">
            Back to Dashboard
          </a>
        </div>
      </header>

      {/* Subhead checklist (extra top margin on mobile so chips aren't clipped) */}
     <div className="mx-auto max-w-6xl px-4 mt-6 md:mt-3">
       <div className="mb-4 pt-1.5 flex items-center gap-2 overflow-x-auto pb-1">
          {checklist.map((c) => (
            <span
              key={c.label}
              className={cx(
                "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ring-1",
                c.ok
                  ? "bg-emerald-500/10 text-emerald-200 ring-emerald-400/30"
                  : "bg-white/5 text-white/70 ring-white/15"
              )}
            >
              {c.ok ? <CheckIcon className="h-4 w-4" /> : <DotIcon className="h-4 w-4" />}
              {c.label}
            </span>
          ))}
        </div>
      </div>

      {/* Main */}
      <main className="mx-auto max-w-6xl px-4 pb-24 sm:pb-12 space-y-6">
        <p className="text-white/70">
          Ordering unlocks when <strong>Terms</strong> are accepted and either a <strong>Buy</strong> contract is
          signed (auto-active) or a <strong>Rent</strong> contract is approved.
        </p>

        {/* Tiles */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Tile
            title="Terms & Conditions"
            statusBadge={<StatusBadge status={termsAccepted ? "approved" : undefined} onClick={() => setShowGuide(true)} />}
            body="You must accept the latest Terms before ordering."
            primary={{
              label: "Read & accept",
              href: `/terms?return=/documents&email=${encodeURIComponent(userEmail)}`,
            }}
          />

          <Tile
            title="Buy Contract"
            statusBadge={<StatusBadge status={buyLatest?.status} onClick={() => setShowGuide(true)} />}
            body="For purchase agreements: a signed contract becomes Active immediately."
            secondary={{ label: "ROI / Calculator", onClick: () => setShowCalc({ open: true, option: "buy" }) }}
            primary={{ label: buyLatest ? "Update / Resign" : "Start", onClick: () => setShowBuy(true) }}
          />

          <Tile
            title="Rent Contract"
            statusBadge={<StatusBadge status={rentLatest?.status} onClick={() => setShowGuide(true)} />}
            body="Rental agreements require admin approval after signing."
            secondary={{ label: "ROI / Calculator", onClick: () => setShowCalc({ open: true, option: "rent" }) }}
            primary={{ label: rentLatest ? "Update / Resign" : "Start", onClick: () => setShowRent(true) }}
          />
        </section>

        {docsComplete && (
          <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-3 text-emerald-200">
            ✅ Documents complete — you can{" "}
            <a className="underline decoration-yellow-400 underline-offset-2" href="/order">
              place an order
            </a>
            .
          </div>
        )}
      </main>

      {/* Sticky mobile CTA */}
      {mobileCta && (
        <div className="fixed bottom-4 left-4 right-4 z-40 md:hidden">
          {mobileCta.href ? (
            <a
              href={mobileCta.href}
              className="block rounded-xl bg-yellow-500 py-3 text-center font-semibold text-[#041F3E] shadow-lg"
            >
              {mobileCta.label}
            </a>
          ) : (
            <button
              onClick={mobileCta.onClick}
              className="block w-full rounded-xl bg-yellow-500 py-3 text-center font-semibold text-[#041F3E] shadow-lg"
            >
              {mobileCta.label}
            </button>
          )}
        </div>
      )}

      {/* Status Guide Bottom Sheet (overlay) */}
      <StatusGuideSheet open={showGuide} onClose={() => setShowGuide(false)} />

      {/* BUY modal (full contract) */}
      {showBuy && (
        <ContractModal
          title="Buy Contract"
          option="buy"
          userEmail={userEmail}
          taId={taFromQuery}
          defaults={{ fuelflow_price_gbp_l: petrolPrice ?? dieselPrice ?? undefined }}
          existing={buyLatest || undefined}
          onClose={() => setShowBuy(false)}
          afterSave={async () => {
            await reloadContracts();
            setShowBuy(false);
          }}
        />
      )}

      {/* RENT modal (full contract) */}
      {showRent && (
        <ContractModal
          title="Rent Contract"
          option="rent"
          userEmail={userEmail}
          taId={taFromQuery}
          defaults={{ fuelflow_price_gbp_l: dieselPrice ?? petrolPrice ?? undefined }}
          existing={rentLatest || undefined}
          onClose={() => setShowRent(false)}
          afterSave={async () => {
            await reloadContracts();
            setShowRent(false);
          }}
        />
      )}

      {/* ROI-only calculator modal */}
      {showCalc.open && (
        <RoiCalculatorModal
          title="ROI / Calculator"
          option={showCalc.option || "buy"}
          defaults={{
            fuelflow_price_gbp_l:
              (showCalc.option === "buy" ? petrolPrice : dieselPrice) ??
              (showCalc.option === "buy" ? dieselPrice : petrolPrice) ??
              undefined,
          }}
          onClose={() => setShowCalc({ open: false, option: null })}
        />
      )}
    </div>
  );
}

/* --------------------------------- Status visuals --------------------------------- */

function StatusBadge({
  status,
  onClick,
}: {
  status?: ContractStatus;
  onClick?: () => void;
}) {
  const config =
    status === "approved"
      ? { label: "Active", ring: "ring-emerald-400/30", bg: "from-emerald-600/25 to-emerald-400/15", text: "text-emerald-200", Icon: CheckIcon }
      : status === "signed"
      ? { label: "Awaiting approval", ring: "ring-amber-400/30", bg: "from-amber-600/25 to-amber-400/15", text: "text-amber-200", Icon: HourglassIcon }
      : status === "cancelled"
      ? { label: "Cancelled", ring: "ring-rose-400/30", bg: "from-rose-600/25 to-rose-400/15", text: "text-rose-200", Icon: XCircleIcon }
      : { label: "Not signed", ring: "ring-slate-400/20", bg: "from-slate-600/25 to-slate-500/10", text: "text-slate-200", Icon: MinusIcon };

  const { label, ring, bg, text, Icon } = config;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        "bg-gradient-to-r",
        ring,
        text,
        "ring-1 hover:ring-2 hover:brightness-110 transition"
      )}
      title="What does this status mean?"
      aria-label={`${label} (tap for guide)`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

/* ------------------------ Bottom Sheet: Status Guide ------------------------ */

function StatusGuideSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <div
      className={cx(
        "fixed inset-0 z-50 transition",
        open ? "pointer-events-auto" : "pointer-events-none"
      )}
      aria-hidden={!open}
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className={cx(
          "absolute inset-0 bg-black/60 transition-opacity",
          open ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
      />
      {/* Sheet */}
      <div
        className={cx(
          "absolute inset-x-0 bottom-0 mx-auto max-w-2xl",
          "rounded-t-2xl border border-white/10 bg-[#0f172a] shadow-2xl",
          "transition-transform duration-300",
          open ? "translate-y-0" : "translate-y-full"
        )}
      >
        <div className="flex items-center justify-between px-4 pt-3">
          <div className="mx-auto h-1.5 w-12 rounded-full bg-white/20" aria-hidden />
        </div>
        <div className="flex items-center justify-between px-4 pb-2">
          <div className="text-sm font-semibold text-white/80">Status guide</div>
          <button
            className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-xs hover:bg-white/[0.1]"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="max-h-[80vh] overflow-y-auto p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <GuideCard title="Active" description="Your contract is approved and ready to use. You can place orders immediately." tone="emerald" Icon={CheckIcon} />
            <GuideCard title="Awaiting approval" description="You’ve signed the contract. Our team must perform a quick compliance check before it goes live." tone="amber" Icon={HourglassIcon} />
            <GuideCard title="Cancelled" description="This contract is no longer active. Start a new one to continue." tone="rose" Icon={XCircleIcon} />
            <GuideCard title="Not signed" description="No contract on file. Start and sign to proceed." tone="slate" Icon={MinusIcon} />
          </div>
        </div>
      </div>
    </div>
  );
}

function GuideCard({
  title,
  description,
  tone,
  Icon,
}: {
  title: string;
  description: string;
  tone: "emerald" | "amber" | "rose" | "slate";
  Icon: React.ComponentType<{ className?: string }>;
}) {
  const map = {
    emerald: { ring: "ring-emerald-400/30", text: "text-emerald-200", bg: "from-emerald-600/20 to-emerald-400/10" },
    amber: { ring: "ring-amber-400/30", text: "text-amber-200", bg: "from-amber-600/20 to-amber-400/10" },
    rose: { ring: "ring-rose-400/30", text: "text-rose-200", bg: "from-rose-600/20 to-rose-400/10" },
    slate: { ring: "ring-slate-400/20", text: "text-slate-200", bg: "from-slate-600/20 to-slate-500/10" },
  }[tone];

  return (
    <div
      className={cx(
        "rounded-xl border border-white/10 p-4",
        "bg-gradient-to-r",
        map.bg,
        map.text,
        "ring-1",
        map.ring
      )}
    >
      <div className="mb-1 inline-flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4" />
        {title}
      </div>
      <div className="text-sm text-white/85">{description}</div>
    </div>
  );
}

/* --------------------------------- Tiles --------------------------------- */

function Tile(props: {
  title: string;
  body: string;
  statusBadge: React.ReactNode;
  secondary?: { label: string; onClick?: () => void; href?: string };
  primary?: { label: string; onClick?: () => void; href?: string };
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">{props.title}</h3>
        {props.statusBadge}
      </div>
      <p className="text-sm text-white/80">{props.body}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {props.secondary &&
          (props.secondary.href ? (
            <a className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15" href={props.secondary.href}>
              {props.secondary.label}
            </a>
          ) : (
            <button className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15" onClick={props.secondary.onClick}>
              {props.secondary.label}
            </button>
          ))}
        {props.primary &&
          (props.primary.href ? (
            <a className="rounded-lg bg-yellow-500 px-3 py-2 text-sm font-semibold text-[#041F3E] hover:bg-yellow-400" href={props.primary.href}>
              {props.primary.label}
            </a>
          ) : (
            <button
              className="rounded-lg bg-yellow-500 px-3 py-2 text-sm font-semibold text-[#041F3E] hover:bg-yellow-400"
              onClick={props.primary.onClick}
            >
              {props.primary.label}
            </button>
          ))}
      </div>
    </div>
  );
}

/* --------------------------- Contract modal (full) --------------------------- */

function ContractModal({
  title,
  option,
  userEmail,
  taId,
  defaults,
  existing,
  onClose,
  afterSave,
}: {
  title: string;
  option: TankOption;
  userEmail: string;
  taId?: string | null;
  defaults?: Partial<ContractRow>;
  existing?: ContractRow;
  onClose: () => void;
  afterSave: () => void | Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // company & contacts
  const [company_name, setCompanyName] = useState(existing?.company_name ?? "");
  const [company_number, setCompanyNumber] = useState(existing?.company_number ?? "");
  const [vat_number, setVatNumber] = useState(existing?.vat_number ?? "");

  const [contact_name, setContactName] = useState(existing?.contact_name ?? "");
  const [contact_email, setContactEmail] = useState(existing?.contact_email ?? userEmail ?? "");
  const [contact_phone, setContactPhone] = useState(existing?.contact_phone ?? "");

  // registered/billing
  const [reg1, setReg1] = useState(existing?.reg_address_line1 ?? "");
  const [reg2, setReg2] = useState(existing?.reg_address_line2 ?? "");
  const [regCity, setRegCity] = useState(existing?.reg_city ?? "");
  const [regPost, setRegPost] = useState(existing?.reg_postcode ?? "");
  const [regCountry, setRegCountry] = useState(existing?.reg_country ?? "UK");

  // site/delivery
  const [site1, setSite1] = useState(existing?.site_address_line1 ?? "");
  const [site2, setSite2] = useState(existing?.site_address_line2 ?? "");
  const [siteCity, setSiteCity] = useState(existing?.site_city ?? "");
  const [sitePost, setSitePost] = useState(existing?.site_postcode ?? "");
  const [siteCountry, setSiteCountry] = useState(existing?.site_country ?? "UK");

  // ROI inputs
  const [tankSize, setTankSize] = useState<number | undefined>(
    existing?.tank_size_l ?? (defaults?.tank_size_l as number | undefined)
  );
  const [monthlyLitres, setMonthlyLitres] = useState<number | undefined>(
    existing?.monthly_consumption_l ?? (defaults?.monthly_consumption_l as number | undefined)
  );
  const [marketPrice, setMarketPrice] = useState<number | undefined>(
    existing?.market_price_gbp_l ?? (defaults?.market_price_gbp_l as number | undefined)
  );
  const [ffPrice, setFfPrice] = useState<number | undefined>(
    existing?.fuelflow_price_gbp_l ?? (defaults?.fuelflow_price_gbp_l as number | undefined)
  );
  const [capex, setCapex] = useState<number | undefined>(
    existing?.capex_gbp ?? (defaults?.capex_gbp as number | undefined)
  );

  // signatory
  const [signature, setSignature] = useState(existing?.signature_name ?? "");

  const monthlySaving = useMemo(() => {
    if (!marketPrice || !ffPrice || !monthlyLitres) return 0;
    const diff = marketPrice - ffPrice;
    return Math.max(0, diff) * monthlyLitres;
  }, [marketPrice, ffPrice, monthlyLitres]);

  const paybackMonths = useMemo(() => {
    if (!capex || !monthlySaving) return null;
    if (monthlySaving <= 0) return null;
    return Math.round((capex / monthlySaving) * 10) / 10;
  }, [capex, monthlySaving]);

  async function getLatestAcceptanceId(): Promise<string | null> {
    const { data, error } = await supabase
      .from("terms_acceptances")
      .select("id")
      .eq("email", userEmail)
      .eq("version", TERMS_VERSION)
      .order("accepted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return null;
    return data?.id ?? null;
  }

  function toNum(v: string): number | undefined {
    if (v === "" || v == null) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  function numOrNull(n: number | undefined): number | null {
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  }
  function fmtMoney(n?: number | null): string {
    if (n == null || !Number.isFinite(Number(n))) return "—";
    const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
    return gbp.format(Number(n));
  }

  async function onSave() {
    try {
      setSubmitting(true);
      setError(null);

      if (!signature.trim()) {
        throw new Error("Please type your full legal name as signature.");
      }

      const now = new Date().toISOString();

      const terms_acceptance_id = taId || (await getLatestAcceptanceId());
      if (!terms_acceptance_id) {
        throw new Error("Please accept the latest Terms before signing the contract.");
      }

      const derivedCustomerName =
        (company_name || "").trim() || (contact_name || "").trim() || (signature || "").trim();

      const payload: Partial<ContractRow> = {
        email: userEmail,
        tank_option: option,
        status: option === "buy" ? "approved" : "signed", // BUY auto-active
        signed_at: now,
        approved_at: option === "buy" ? now : null,

        customer_name: derivedCustomerName,

        company_name,
        company_number,
        vat_number,

        contact_name,
        contact_email,
        contact_phone,

        reg_address_line1: reg1,
        reg_address_line2: reg2,
        reg_city: regCity,
        reg_postcode: regPost,
        reg_country: regCountry,

        site_address_line1: site1,
        site_address_line2: site2,
        site_city: siteCity,
        site_postcode: sitePost,
        site_country: siteCountry,

        tank_size_l: numOrNull(tankSize),
        monthly_consumption_l: numOrNull(monthlyLitres),
        market_price_gbp_l: numOrNull(marketPrice),
        fuelflow_price_gbp_l: numOrNull(ffPrice),
        capex_gbp: numOrNull(capex),

        signature_name: signature,

        terms_acceptance_id,
      } as any;

      const { error } = await supabase.from("contracts").insert([payload]);
      if (error) throw error;

      await afterSave();
    } catch (e: any) {
      setError(e?.message || "Failed to save contract.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative z-10 w-full max-w-3xl rounded-2xl border border-white/10 bg-[#0f172a] shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded-md bg-white/10 px-2 py-1 text-sm hover:bg-white/15">
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div className="max-h-[80vh] overflow-y-auto p-4 space-y-5">
          {/* Company */}
          <Section title="Company details">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Company name" value={company_name} onChange={setCompanyName} />
              <Field label="Company number" value={company_number} onChange={setCompanyNumber} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="VAT number" value={vat_number} onChange={setVatNumber} />
            </div>
          </Section>

          {/* Contact */}
          <Section title="Primary contact">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Name" value={contact_name} onChange={setContactName} />
              <Field label="Email" value={contact_email} onChange={setContactEmail} type="email" />
              <Field label="Phone" value={contact_phone} onChange={setContactPhone} />
            </div>
          </Section>

          {/* Registered address */}
          <Section title="Registered / billing address">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Address line 1" value={reg1} onChange={setReg1} />
              <Field label="Address line 2" value={reg2} onChange={setReg2} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="City" value={regCity} onChange={setRegCity} />
              <Field label="Postcode" value={regPost} onChange={setRegPost} />
              <Field label="Country" value={regCountry} onChange={setRegCountry} />
            </div>
          </Section>

          {/* Site address */}
          <Section title="Site / delivery address">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Address line 1" value={site1} onChange={setSite1} />
              <Field label="Address line 2" value={site2} onChange={setSite2} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="City" value={siteCity} onChange={setSiteCity} />
              <Field label="Postcode" value={sitePost} onChange={setSitePost} />
              <Field label="Country" value={siteCountry} onChange={setSiteCountry} />
            </div>
          </Section>

          {/* ROI */}
          <Section title="Tank & ROI">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Tank size (L)" value={tankSize} onChange={(v) => setTankSize(toNum(v))} type="number" />
              <Field label="Monthly consumption (L)" value={monthlyLitres} onChange={(v) => setMonthlyLitres(toNum(v))} type="number" />
              <span />
              <Field label="Market price (£/L)" value={marketPrice} onChange={(v) => setMarketPrice(toNum(v))} type="number" />
              <Field label="FuelFlow price (£/L)" value={ffPrice} onChange={(v) => setFfPrice(toNum(v))} type="number" />
              <Field label="Capex (£)" value={capex} onChange={(v) => setCapex(toNum(v))} type="number" />
            </div>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <SummaryCard label="FuelFlow price" value={fmtMoney(ffPrice)} />
              <SummaryCard label="Est. monthly savings" value={fmtMoney(monthlySaving)} />
              <SummaryCard label="Est. payback" value={paybackMonths ? `${paybackMonths} mo` : "—"} />
            </div>
          </Section>

          {/* Signature */}
          <Section title="Signature">
            <Field
              label="Type your full legal name as signature"
              value={signature}
              onChange={setSignature}
              placeholder="Jane Smith"
            />
            <p className="mt-2 text-xs text-white/60">
              By signing you agree to the Terms and the figures above are estimates. Buy contracts become active
              immediately; Rent contracts require admin approval.
            </p>
          </Section>

          {error && <div className="rounded-lg border border-red-400/40 bg-red-500/10 p-2 text-sm text-red-200">{error}</div>}
        </div>

        {/* sticky footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-white/10">
          <button className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15" onClick={onClose}>
            Cancel
          </button>
          <button
            className="rounded-lg bg-yellow-500 px-3 py-2 text-sm font-semibold text-[#041F3E] hover:bg-yellow-400 disabled:opacity-60"
            disabled={submitting}
            onClick={onSave}
          >
            {submitting ? "Saving…" : "Sign & Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------- ROI-only calculator --------------------------- */

function RoiCalculatorModal({
  title,
  option,
  defaults,
  onClose,
}: {
  title: string;
  option: TankOption;
  defaults?: Partial<ContractRow>;
  onClose: () => void;
}) {
  const [tankSize, setTankSize] = useState<number | undefined>(defaults?.tank_size_l ?? undefined);
  const [monthlyLitres, setMonthlyLitres] = useState<number | undefined>(defaults?.monthly_consumption_l ?? undefined);
  const [marketPrice, setMarketPrice] = useState<number | undefined>(defaults?.market_price_gbp_l ?? undefined);
  const [ffPrice, setFfPrice] = useState<number | undefined>(defaults?.fuelflow_price_gbp_l ?? undefined);
  const [capex, setCapex] = useState<number | undefined>(defaults?.capex_gbp ?? undefined);

  const monthlySaving = useMemo(() => {
    if (!marketPrice || !ffPrice || !monthlyLitres) return 0;
    const diff = marketPrice - ffPrice;
    return Math.max(0, diff) * monthlyLitres;
  }, [marketPrice, ffPrice, monthlyLitres]);

  const paybackMonths = useMemo(() => {
    if (!capex || !monthlySaving) return null;
    if (monthlySaving <= 0) return null;
    return Math.round((capex / monthlySaving) * 10) / 10;
  }, [capex, monthlySaving]);

  function toNum(v: string): number | undefined {
    if (v === "" || v == null) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  function fmtMoney(n?: number | null): string {
    if (n == null || !Number.isFinite(Number(n))) return "—";
    const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
    return gbp.format(Number(n));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0f172a] shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h3 className="text-lg font-semibold">
            {title} <span className="text-white/60">({option === "buy" ? "Buy" : "Rent"})</span>
          </h3>
          <button onClick={onClose} className="rounded-md bg-white/10 px-2 py-1 text-sm hover:bg-white/15">✕</button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto p-4 space-y-5">
          <Section title="Inputs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Tank size (L)" value={tankSize} onChange={(v) => setTankSize(toNum(v))} type="number" />
              <Field label="Monthly consumption (L)" value={monthlyLitres} onChange={(v) => setMonthlyLitres(toNum(v))} type="number" />
              <span />
              <Field label="Market price (£/L)" value={marketPrice} onChange={(v) => setMarketPrice(toNum(v))} type="number" />
              <Field label="FuelFlow price (£/L)" value={ffPrice} onChange={(v) => setFfPrice(toNum(v))} type="number" />
              <Field label="Capex (£)" value={capex} onChange={(v) => setCapex(toNum(v))} type="number" />
            </div>
          </Section>

          <Section title="Results">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <SummaryCard label="FuelFlow price" value={fmtMoney(ffPrice)} />
              <SummaryCard label="Est. monthly savings" value={fmtMoney(monthlySaving)} />
              <SummaryCard label="Est. payback" value={paybackMonths ? `${paybackMonths} mo` : "—"} />
            </div>
          </Section>
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-white/10">
          <button className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- Shared bits --------------------------------- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-2 text-sm font-semibold text-white/80">{title}</div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value?: string | number;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-white/70">{label}</span>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-white/10 bg-white/[0.06] p-2 text-sm placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-yellow-400"
      />
    </label>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.05] p-3">
      <div className="text-xs text-white/60">{label}</div>
      <div className="text-base font-semibold">{value}</div>
    </div>
  );
}

/* ------------------------------ Icons ------------------------------ */

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function HourglassIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 3h12M6 21h12M8 7a4 4 0 0 0 8 0M16 17a4 4 0 0 0-8 0" strokeLinecap="round" />
    </svg>
  );
}
function XCircleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9l-6 6M9 9l6 6" strokeLinecap="round" />
    </svg>
  );
}
function MinusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h14" strokeLinecap="round" />
    </svg>
  );
}
function DotIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 8 8" className={className} fill="currentColor" aria-hidden>
      <circle cx="4" cy="4" r="4" />
    </svg>
  );
}
function BackIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
