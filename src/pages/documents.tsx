// src/pages/documents.tsx
// src/pages/documents.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

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
};

type PriceRow = { fuel: string; total_price: number; price_date?: string | null };

function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export default function DocumentsPage() {
  const [userEmail, setUserEmail] = useState<string>("");
  const [termsAccepted, setTermsAccepted] = useState<boolean>(false);

  const [buyLatest, setBuyLatest] = useState<ContractRow | null>(null);
  const [rentLatest, setRentLatest] = useState<ContractRow | null>(null);

  // prices (to prefill calculator)
  const [petrolPrice, setPetrolPrice] = useState<number | null>(null);
  const [dieselPrice, setDieselPrice] = useState<number | null>(null);

  // modals
  const [showBuy, setShowBuy] = useState(false);
  const [showRent, setShowRent] = useState(false);

  // ---------- load ----------
  useEffect(() => {
    (async () => {
      // auth
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        window.location.href = "/login";
        return;
      }
      const emailLower = (auth.user.email || "").toLowerCase();
      setUserEmail(emailLower);

      // terms
      const { data: t } = await supabase
        .from("terms_acceptances")
        .select("id")
        .eq("email", emailLower)
        .eq("version", TERMS_VERSION)
        .limit(1);
      setTermsAccepted(!!t?.length);

      // contracts
      await reloadContracts(emailLower);

      // prices for calculator defaults
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

    // Take the newest row for each option (whatever its status is)
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
      // fallback daily_prices – take latest per fuel
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
      const vals = Array.from(seen.values());
      for (const r of vals) {
        if (r.fuel.toLowerCase() === "petrol") setPetrolPrice(Number(r.total_price));
        if (r.fuel.toLowerCase() === "diesel") setDieselPrice(Number(r.total_price));
      }
    }
  }

  const docsComplete =
    termsAccepted &&
    ((buyLatest && buyLatest.status === "approved") || (rentLatest && rentLatest.status === "approved"));

  return (
    <div className="min-h-screen bg-[#0b1220] text-white">
      <header className="max-w-6xl mx-auto flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-3">
          <img src="/logo-email.png" alt="FuelFlow" className="h-7 w-auto" />
          <h1 className="text-2xl font-bold">Documents</h1>
        </div>
        <a href="/client-dashboard" className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15">
          Back to Dashboard
        </a>
      </header>

      <main className="max-w-6xl mx-auto px-4 pb-12 space-y-6">
        <p className="text-white/70">
          Ordering unlocks when <strong>Terms</strong> are accepted and either a <strong>Buy</strong> contract is
          signed (auto-active) or a <strong>Rent</strong> contract is approved.
        </p>

        {/* Tiles */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Tile
            title="Terms & Conditions"
            statusPill={termsAccepted ? ["ok", "ok"] : ["missing", "Missing"]}
            body="You must accept the latest Terms before ordering."
            primary={{
              label: "Read & accept",
              href: `/terms?return=/documents&email=${encodeURIComponent(userEmail)}`,
            }}
          />

          <Tile
            title="Buy Contract"
            statusPill={statusToPill(buyLatest?.status)}
            body="For purchase agreements: a signed contract becomes Active immediately."
            secondary={{ label: "ROI / Calculator", onClick: () => setShowBuy(true) }}
            primary={{ label: buyLatest ? "Update / Resign" : "Start", onClick: () => setShowBuy(true) }}
          />

            <Tile
              title="Rent Contract"
              statusPill={statusToPill(rentLatest?.status)}
              body="Rental agreements require admin approval after signing."
              secondary={{ label: "ROI / Calculator", onClick: () => setShowRent(true) }}
              primary={{ label: rentLatest ? "Update / Resign" : "Start", onClick: () => setShowRent(true) }}
            />
        </section>

        {/* Status legend */}
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/85">
          <div className="font-semibold mb-1">What do the statuses mean?</div>
          <ul className="list-disc pl-5 space-y-1 text-white/80">
            <li><span className="text-emerald-300 font-medium">Active</span> — contract is approved and you can order.</li>
            <li><span className="text-yellow-300 font-medium">Awaiting approval</span> — you’ve signed; our team must approve (Rent only).</li>
            <li><span className="text-red-300 font-medium">Cancelled</span> — this contract has been cancelled; start a new one to continue.</li>
            <li><span className="text-white/60 font-medium">Not signed</span> — no contract on file yet.</li>
          </ul>
        </div>

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

      {/* BUY modal */}
      {showBuy && (
        <ContractModal
          title="Buy Contract"
          option="buy"
          userEmail={userEmail}
          defaults={{
            fuelflow_price_gbp_l: petrolPrice ?? dieselPrice ?? undefined,
          }}
          existing={buyLatest || undefined}
          onClose={() => setShowBuy(false)}
          afterSave={async () => {
            await reloadContracts();
            setShowBuy(false);
          }}
        />
      )}

      {/* RENT modal */}
      {showRent && (
        <ContractModal
          title="Rent Contract"
          option="rent"
          userEmail={userEmail}
          defaults={{
            fuelflow_price_gbp_l: dieselPrice ?? petrolPrice ?? undefined,
          }}
          existing={rentLatest || undefined}
          onClose={() => setShowRent(false)}
          afterSave={async () => {
            await reloadContracts();
            setShowRent(false);
          }}
        />
      )}
    </div>
  );
}

/* --------------------------------- UI bits --------------------------------- */

function statusToPill(status?: ContractStatus): ["ok" | "warn" | "pending" | "missing" | "muted", string] {
  if (!status) return ["muted", "Not signed"];
  if (status === "approved") return ["ok", "Active"];
  if (status === "signed") return ["warn", "Awaiting approval"];
  if (status === "cancelled") return ["missing", "Cancelled"];
  return ["pending", status]; // draft or any other
}

function Tile(props: {
  title: string;
  body: string;
  statusPill: ["ok" | "warn" | "pending" | "missing" | "muted", string];
  secondary?: { label: string; onClick?: () => void; href?: string };
  primary?: { label: string; onClick?: () => void; href?: string };
}) {
  const [kind, label] = props.statusPill;
  const pill =
    kind === "ok"
      ? "bg-emerald-600/20 text-emerald-300"
      : kind === "warn"
      ? "bg-yellow-600/20 text-yellow-300"
      : kind === "pending"
      ? "bg-blue-600/20 text-blue-300"
      : kind === "missing"
      ? "bg-red-600/20 text-red-300"
      : "bg-white/15 text-white/60";

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">{props.title}</h3>
        <span className={cx("rounded-full px-2 py-0.5 text-xs font-medium", pill)}>{label}</span>
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

/* --------------------------- Contract modal --------------------------- */

function ContractModal({
  title,
  option,
  userEmail,
  defaults,
  existing,
  onClose,
  afterSave,
}: {
  title: string;
  option: TankOption;
  userEmail: string;
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

  async function onSave() {
    try {
      setSubmitting(true);
      setError(null);

      if (!signature.trim()) {
        throw new Error("Please type your full legal name as signature.");
      }

      const now = new Date().toISOString();

      // IMPORTANT: customer_name is NOT NULL in your table
      const derivedCustomerName =
        (company_name || "").trim() ||
        (contact_name || "").trim() ||
        (signature || "").trim();

      const payload: Partial<ContractRow> = {
        email: userEmail,
        tank_option: option,
        status: option === "buy" ? "approved" : "signed", // BUY becomes active immediately
        signed_at: now,
        approved_at: option === "buy" ? now : null,

        // satisfies NOT NULL constraint
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
        <div className="max-h-[75vh] overflow-y-auto p-4 space-y-5">
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
              <Field
                label="Monthly consumption (L)"
                value={monthlyLitres}
                onChange={(v) => setMonthlyLitres(toNum(v))}
                type="number"
              />
              <span />
              <Field
                label="Market price (£/L)"
                value={marketPrice}
                onChange={(v) => setMarketPrice(toNum(v))}
                type="number"
              />
              <Field
                label="FuelFlow price (£/L)"
                value={ffPrice}
                onChange={(v) => setFfPrice(toNum(v))}
                type="number"
              />
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

          {error && (
            <div className="rounded-lg border border-red-400/40 bg-red-500/10 p-2 text-sm text-red-200">{error}</div>
          )}
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-2 text-sm font-semibold text-white/80">{title}</div>
      <div className="space-y-3">{children}</div>
    </div>
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

/* --------------------------- helpers --------------------------- */

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

