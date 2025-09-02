// src/pages/order.tsx
// src/pages/order.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import HCaptcha from "@hcaptcha/react-hcaptcha";

type Fuel = "diesel" | "petrol";
type TankOpt = "none" | "buy" | "rent";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

function fmtGBP(n: number) {
  return gbp.format(n);
}

/* ---------- helpers ---------- */
async function getSessionToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}

/* ---------- Page ---------- */
export default function OrderPage() {
  // prices (live)
  const [prices, setPrices] = useState<{ petrol: number; diesel: number } | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);

  // product
  const [fuel, setFuel] = useState<Fuel>("diesel");
  const [litres, setLitres] = useState<number>(1000);
  const unitPrice = useMemo(
    () => (fuel === "diesel" ? prices?.diesel ?? 0 : prices?.petrol ?? 0),
    [fuel, prices]
  );
  const total = useMemo(() => litres * unitPrice, [litres, unitPrice]);

  // tank / contracts
  const [tankOption, setTankOption] = useState<TankOpt>("none");
  const contractNeeded = tankOption === "buy" || tankOption === "rent";

  type CState = { exists: boolean; status?: "signed" | "approved"; approved?: boolean };
  const [buyContract, setBuyContract] = useState<CState>({ exists: false });
  const [rentContract, setRentContract] = useState<CState>({ exists: false });

  // basic details (minimal)
  const [email, setEmail] = useState<string>("");
  const [fullName, setFullName] = useState<string>("");
  const [address1, setAddress1] = useState<string>("");
  const [address2, setAddress2] = useState<string>("");
  const [city, setCity] = useState<string>("");
  const [postcode, setPostcode] = useState<string>("");
  const [deliveryDate, setDeliveryDate] = useState<string>("");

  // terms
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  // modals
  const [showContract, setShowContract] = useState<null | "buy" | "rent">(null);

  // load prices once
  useEffect(() => {
    (async () => {
      try {
        setPriceError(null);
        const r = await fetch("/api/prices");
        if (!r.ok) throw new Error((await r.json())?.error || "Price API error");
        const j = await r.json();
        setPrices({ petrol: Number(j.petrol), diesel: Number(j.diesel) });
      } catch (e: any) {
        setPriceError(e?.message || "Failed to load prices");
      }
    })();
  }, []);

  // load contract statuses for the logged-in user
  useEffect(() => {
    (async () => {
      const token = await getSessionToken();
      if (!token) return; // not logged, page will probably redirect elsewhere

      const h = { Authorization: `Bearer ${token}` };

      const [buyRes, rentRes] = await Promise.all([
        fetch(`/api/contracts/latest?option=buy`, { headers: h }),
        fetch(`/api/contracts/latest?option=rent`, { headers: h }),
      ]);

      const b = buyRes.ok ? await buyRes.json() : { exists: false };
      const r = rentRes.ok ? await rentRes.json() : { exists: false };
      setBuyContract(b);
      setRentContract(r);
    })();
  }, []);

  // Stripe checkout
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    // guardrails
    if (!acceptedTerms) return alert("Please accept the Terms & Conditions first.");

    if (contractNeeded) {
      if (tankOption === "buy" && !buyContract.exists) {
        return alert("Please sign your BUY contract before paying.");
      }
      if (tankOption === "rent") {
        if (!rentContract.exists) return alert("Please sign your RENT contract first.");
        if (!rentContract.approved) {
          return alert("Your RENT contract is awaiting admin approval. Payment is disabled until approval.");
        }
      }
    }

    try {
      // create order + Stripe session (server reads the latest price again)
      const resp = await fetch("/api/stripe/checkout/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userEmail: email || undefined,
          fuel,
          litres,
          deliveryDate: deliveryDate || undefined,
          name: fullName || undefined,
          address: [address1, address2, city, postcode].filter(Boolean).join(", "),
          postcode,
        }),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "Failed to create order");

      window.location.href = data.url; // redirect to Stripe Checkout
    } catch (e: any) {
      alert(e?.message || "Failed to create order");
    }
  }

  // derived UI flags
  const rentAwaitingApproval = rentContract.exists && !rentContract.approved;
  const disablePay =
    !acceptedTerms ||
    (contractNeeded && tankOption === "buy" && !buyContract.exists) ||
    (contractNeeded && tankOption === "rent" && !rentContract.approved);

  return (
    <main className="min-h-screen bg-[#071B33] text-white">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-end px-4 pt-6">
        <a href="/client-dashboard" className="text-sm text-white/80 hover:text-white">
          Back to Dashboard
        </a>
      </div>

      <section className="mx-auto w-full max-w-6xl px-4">
        <h1 className="mt-2 text-3xl font-bold">Place an Order</h1>

        {/* BUY / RENT panels */}
        <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
          <Panel
            title="Buy a Fuel Tank"
            selected={tankOption === "buy"}
            onSelect={() => setTankOption("buy")}
            onStartContract={() => setShowContract("buy")}
            contractStatus={
              buyContract.exists
                ? "signed" // there is no approval step for buy in your flow
                : null
            }
          />

          <Panel
            title="Rent a Fuel Tank"
            selected={tankOption === "rent"}
            onSelect={() => setTankOption("rent")}
            onStartContract={() => setShowContract("rent")}
            contractStatus={
              rentContract.exists ? (rentContract.approved ? "approved" : "awaiting") : null
            }
          />
        </div>

        {/* Price cards */}
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card title="Petrol (95)" value={fmtGBP(prices?.petrol ?? 0)} suffix="/ litre" />
          <Card title="Diesel" value={fmtGBP(prices?.diesel ?? 0)} suffix="/ litre" />
          <Card title="Estimated Total" value={fmtGBP(total)} />
        </div>

        {priceError && (
          <p className="mt-2 text-sm text-red-300">
            Price load error: {priceError}
          </p>
        )}

        {/* Order form */}
        <form onSubmit={onSubmit} className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Fuel">
              <select
                value={fuel}
                onChange={(e) => setFuel(e.target.value as Fuel)}
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
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none"
              />
            </Field>

            <Field label="Your email (receipt)">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none"
              />
            </Field>

            <Field className="md:col-span-2" label="Full name">
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none"
              />
            </Field>

            <Field label="Address line 1">
              <input
                value={address1}
                onChange={(e) => setAddress1(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none"
              />
            </Field>

            <Field label="Address line 2">
              <input
                value={address2}
                onChange={(e) => setAddress2(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none"
              />
            </Field>

            <Field label="Postcode">
              <input
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none"
              />
            </Field>

            <Field label="City">
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none"
              />
            </Field>

            <Field label="Tank option" className="md:col-span-2">
              <div className="flex flex-wrap gap-3">
                {(["none", "buy", "rent"] as const).map((opt) => {
                  const disabled =
                    (opt === "buy" && buyContract.exists) ||
                    (opt === "rent" && rentContract.exists);
                  return (
                    <button
                      key={opt}
                      type="button"
                      disabled={disabled}
                      onClick={() => setTankOption(opt)}
                      className={`rounded-xl border px-4 py-2 ${
                        tankOption === opt
                          ? "border-yellow-400 bg-yellow-400/10"
                          : "border-white/15 bg-white/5 hover:bg-white/10"
                      } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
                    >
                      {opt === "none" ? "No tank" : opt.toUpperCase()}
                    </button>
                  );
                })}
              </div>

              {/* status line */}
              {tankOption === "buy" && buyContract.exists && (
                <p className="mt-2 text-sm text-green-400">Contract signed.</p>
              )}
              {tankOption === "rent" && rentContract.exists && !rentContract.approved && (
                <p className="mt-2 text-sm text-yellow-300">
                  Signed (awaiting admin approval). Payment is disabled until approved.
                </p>
              )}
              {tankOption === "rent" && rentContract.approved && (
                <p className="mt-2 text-sm text-green-400">Contract approved.</p>
              )}
            </Field>
          </div>

          {/* Terms + CTA */}
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 md:items-center">
            <label className="inline-flex items-center gap-3 text-sm text-white/80">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="h-4 w-4 accent-yellow-500"
              />
              <span>
                I agree to the{" "}
                <a href="/terms" target="_blank" className="underline underline-offset-4 hover:text-white">
                  Terms &amp; Conditions
                </a>
                .
              </span>
            </label>

            <div className="flex items-center justify-end gap-3">
              <button
                type="submit"
                disabled={disablePay}
                className={`rounded-xl px-5 py-2 font-semibold ${
                  disablePay
                    ? "cursor-not-allowed bg-yellow-500/50 text-[#041F3E]"
                    : "bg-yellow-500 text-[#041F3E] hover:bg-yellow-400"
                }`}
              >
                Pay with Stripe
              </button>
            </div>
          </div>
        </form>

        {/* Rent "grey out" overlay hint (visible when already signed) */}
        {rentAwaitingApproval && (
          <div className="fixed inset-0 pointer-events-none bg-black/30 backdrop-blur-[1px]" />
        )}

        {/* contract modal */}
        {showContract && (
          <ContractModal
            option={showContract}
            onClose={() => setShowContract(null)}
            fuel={fuel}
            litres={litres}
            onSigned={(opt) => {
              if (opt === "buy") setBuyContract({ exists: true, status: "signed", approved: true });
              if (opt === "rent") setRentContract({ exists: true, status: "signed", approved: false });
            }}
          />
        )}

        <footer className="flex items-center justify-center py-10 text-sm text-white/60">
          © {new Date().getFullYear()} FuelFlow. All rights reserved.
        </footer>
      </section>
    </main>
  );
}

/* ---------- sub components ---------- */
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

function Pill({ text, tone }: { text: string; tone: "neutral" | "good" | "warn" }) {
  const cls =
    tone === "good"
      ? "bg-green-500/20 text-green-300"
      : tone === "warn"
      ? "bg-yellow-500/20 text-yellow-300"
      : "bg-white/10 text-white/80";
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs ${cls}`}>{text}</span>;
}

function Panel({
  title,
  selected,
  onSelect,
  onStartContract,
  contractStatus,
}: {
  title: string;
  selected: boolean;
  onSelect: () => void;
  onStartContract: () => void;
  /** null | "signed" | "awaiting" | "approved" */
  contractStatus: null | "signed" | "awaiting" | "approved";
}) {
  const disabled = contractStatus != null;
  return (
    <div className={`rounded-2xl border p-6 ${selected ? "border-yellow-400 bg-white/5" : "border-white/10 bg-white/5"}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-semibold">{title}</h3>
        <button
          type="button"
          onClick={onSelect}
          className={`rounded-xl px-3 py-1 text-sm ${selected ? "bg-yellow-400 text-[#041F3E]" : "border border-white/20 bg-white/10"}`}
        >
          {selected ? "Selected" : "Select"}
        </button>
      </div>

      <ul className="mt-4 space-y-2 text-white/80">
        <li className="flex gap-2"><span>✔</span><span>Flexible plans & support included.</span></li>
        <li className="flex gap-2"><span>✔</span><span>Ideal for long or temporary sites.</span></li>
        <li className="flex gap-2"><span>✔</span><span>Best value via FuelFlow rates.</span></li>
      </ul>

      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 hover:bg-white/15">
          Open ROI
        </button>

        {disabled ? (
          contractStatus === "approved" ? (
            <Pill text="Contract approved" tone="good" />
          ) : contractStatus === "awaiting" ? (
            <Pill text="Awaiting admin approval" tone="warn" />
          ) : (
            <Pill text="Contract signed" tone="good" />
          )
        ) : (
          <button
            type="button"
            onClick={onStartContract}
            className="rounded-xl bg-yellow-500 px-4 py-2 font-semibold text-[#041F3E] hover:bg-yellow-400"
          >
            Start Contract
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- Contract Modal (minimal) ---------- */
function ContractModal({
  option,
  onClose,
  onSigned,
  fuel,
  litres,
}: {
  option: "buy" | "rent";
  onClose: () => void;
  onSigned: (opt: "buy" | "rent") => void;
  fuel: Fuel;
  litres: number;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [signature, setSignature] = useState("");
  const [accept, setAccept] = useState(false);
  const [captcha, setCaptcha] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setMsg(null);
    if (!fullName || !email || !signature || !accept) {
      setMsg("Please complete name, email, signature and accept the terms.");
      return;
    }
    if (!captcha) return setMsg("Please complete the captcha.");

    try {
      setSaving(true);
      const resp = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          email,
          option,
          fuel,
          litres,
          terms_version: "v1",
          signature_name: signature,
          hcaptchaToken: captcha,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "Failed to save contract");

      setMsg("Contract signed and saved.");
      onSigned(option);
      setTimeout(onClose, 800);
    } catch (e: any) {
      setMsg(e?.message || "Failed to save contract");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-[101] w-[min(980px,94vw)] max-h-[92vh] overflow-hidden rounded-2xl border border-white/10 bg-[#0E2E57] shadow-2xl">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-white/10 bg-[#0A2446]">
          <img src="/logo-email.png" alt="FuelFlow" className="h-7 w-auto" />
          <h2 className="text-lg font-semibold text-white">FuelFlow {option === "buy" ? "Purchase" : "Rental"} Contract</h2>
          <button onClick={onClose} className="ml-auto rounded-lg px-3 py-1.5 text-white/70 hover:bg-white/10">✕</button>
        </div>

        <div className="grid max-h-[calc(92vh-140px)] grid-cols-1 gap-6 overflow-y-auto p-6 md:grid-cols-2">
          <div>
            <label className="block mb-2 text-sm text-white/80">Full name</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full rounded-xl border border-white/15 bg-[#0A2446] p-2 outline-none" />
            <label className="block mt-3 mb-2 text-sm text-white/80">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-white/15 bg-[#0A2446] p-2 outline-none" />
            <label className="block mt-3 mb-2 text-sm text-white/80">Signature (type full name)</label>
            <input value={signature} onChange={(e) => setSignature(e.target.value)} className="w-full rounded-xl border border-white/15 bg-[#0A2446] p-2 outline-none" />
            <label className="mt-3 inline-flex items-center gap-2 text-sm text-white/80">
              <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} className="h-4 w-4 accent-yellow-500" />
              I am authorised and accept FuelFlow’s Terms &amp; Conditions.
            </label>
            <div className="mt-3">
              <HCaptcha
                sitekey={process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY || ""}
                onVerify={setCaptcha}
                onExpire={() => setCaptcha("")}
                onClose={() => setCaptcha("")}
              />
            </div>
          </div>

          <div className="text-sm text-white/80">
            <h3 className="mb-2 font-semibold text-white/90">Key terms (summary)</h3>
            <ul className="space-y-2">
              <li>• Equipment safe/compliant; partner install if needed.</li>
              <li>• Rental equipment remains ours/partner property.</li>
              <li>• Use reasonable care; report incidents immediately.</li>
              <li>• Deliveries subject to availability & access.</li>
              <li>• Prices follow market until order confirmation.</li>
              {option === "rent" ? (
                <li>• Rent requires admin approval before payments.</li>
              ) : (
                <li>• Buy is a one-off purchase (no approval step).</li>
              )}
            </ul>

            {msg && <p className="mt-4 text-sm {msg.startsWith('Failed') ? 'text-red-300' : 'text-green-400'}">{msg}</p>}

            <div className="mt-5 flex items-center justify-end gap-3">
              <button onClick={onClose} type="button" className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 hover:bg-white/10">
                Cancel
              </button>
              <button
                onClick={save}
                type="button"
                disabled={saving}
                className="rounded-xl bg-yellow-500 px-4 py-2 font-semibold text-[#041F3E] hover:bg-yellow-400 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Sign & Save"}
              </button>
            </div>
          </div>
        </div>

        <div className="border-t border-white/10 bg-[#0A2446] px-6 py-3 text-right text-xs text-white/60">
          Signed contracts are stored in your account. You can view them from the client dashboard.
        </div>
      </div>
    </div>
  );
}

