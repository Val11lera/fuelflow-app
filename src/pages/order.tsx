// src/pages/order.tsx
// src/pages/order.tsx
// src/pages/order.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { createClient } from "@supabase/supabase-js";

type Fuel = "diesel" | "petrol";
type TankOpt = "none" | "buy" | "rent";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

const fmtGBP = (n: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);

export default function OrderPage() {
  // Prices
  const [petrol, setPetrol] = useState<number | null>(null);
  const [diesel, setDiesel] = useState<number | null>(null);
  const [priceErr, setPriceErr] = useState<string | null>(null);

  // Form
  const [fuel, setFuel] = useState<Fuel>("diesel");
  const [litres, setLitres] = useState<number>(1000);
  const [deliveryDate, setDeliveryDate] = useState<string>("");

  const [email, setEmail] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [address1, setAddress1] = useState<string>("");
  const [address2, setAddress2] = useState<string>("");
  const [city, setCity] = useState<string>("");
  const [postcode, setPostcode] = useState<string>("");

  const [tankOpt, setTankOpt] = useState<TankOpt>("none");

  // Terms
  const [accepted, setAccepted] = useState(false);

  // Contract statuses
  const [buySigned, setBuySigned] = useState(false);
  const [rentStatus, setRentStatus] = useState<"none" | "signed" | "approved">("none");

  // Contract modal
  const [showContract, setShowContract] = useState<null | "buy" | "rent">(null);

  const unitPrice = useMemo(() => (fuel === "diesel" ? diesel : petrol) ?? 0, [fuel, petrol, diesel]);
  const total = useMemo(() => (unitPrice || 0) * (litres || 0), [unitPrice, litres]);

  // Load prices + defaults + contract statuses
  useEffect(() => {
    (async () => {
      // prices from the canonical view
      try {
        const { data, error } = await supabase
          .from("latest_prices")
          .select("fuel,total_price");

        if (error) throw error;

        (data || []).forEach((r: any) => {
          if (r.fuel === "petrol") setPetrol(Number(r.total_price));
          if (r.fuel === "diesel") setDiesel(Number(r.total_price));
        });
      } catch (e: any) {
        setPriceErr(e?.message || "Failed to load prices");
      }

      // preload email from auth (if any)
      const { data: auth } = await supabase.auth.getUser();
      const userEmail = auth?.user?.email || "";
      if (userEmail) setEmail(userEmail);

      // check latest contract statuses (requires JWT)
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;

      for (const opt of ["buy", "rent"] as const) {
        const r = await fetch(`/api/contracts/latest?option=${opt}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }).then((x) => x.json());

        if (r?.exists && opt === "buy") setBuySigned(true);
        if (r?.exists && opt === "rent") setRentStatus(r.status === "approved" ? "approved" : "signed");
      }
    })();
  }, []);

  // CTA disabled logic
  const needsContract = tankOpt !== "none";
  const rentAwaitingApproval = tankOpt === "rent" && rentStatus !== "approved";
  const buyMissingSignature = tankOpt === "buy" && !buySigned;
  const ctaDisabled =
    !accepted ||
    litres <= 0 ||
    unitPrice <= 0 ||
    (tankOpt === "buy" && buyMissingSignature) ||
    (tankOpt === "rent" && rentAwaitingApproval);

  async function startCheckout() {
    try {
      const body = {
        fuel,
        litres,
        deliveryDate,
        email,
        name,
        address1,
        address2,
        city,
        postcode,
        tankOption: tankOpt,
      };

      const res = await fetch("/api/order/start-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to create order");

      // if rent requires approval, show message
      if (data.requires_admin_approval) {
        alert("We’ve received your rental request. An admin will review and approve shortly. Payment will be enabled afterwards.");
        return;
      }

      // redirect to Stripe
      if (data?.url) {
        window.location.href = data.url;
      } else {
        alert("Order created, but no Stripe URL returned.");
      }
    } catch (e: any) {
      alert(e?.message || "Failed to create order");
    }
  }

  return (
    <main className="min-h-screen bg-[#071B33] text-white">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-end px-4 pt-6">
        <a href="/client-dashboard" className="text-sm text-white/80 hover:text-white">
          Back to Dashboard
        </a>
      </div>

      <section className="mx-auto w-full max-w-6xl px-4">
        <h1 className="mt-2 text-3xl font-bold">Place an Order</h1>

        {/* BUY / RENT */}
        <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
          <Panel
            title="Buy a Fuel Tank"
            selected={tankOpt === "buy"}
            onSelect={() => setTankOpt("buy")}
            dimmed={buySigned}
            badge={buySigned ? "Contract signed" : undefined}
            onOpenROI={() => alert("ROI calculator coming soon")}
            onStartContract={() => setShowContract("buy")}
          />

          <Panel
            title="Rent a Fuel Tank"
            selected={tankOpt === "rent"}
            onSelect={() => setTankOpt("rent")}
            dimmed={rentStatus !== "none"}
            badge={rentStatus === "approved" ? "Approved" : rentStatus === "signed" ? "Awaiting admin approval" : undefined}
            onOpenROI={() => alert("ROI calculator coming soon")}
            onStartContract={() => setShowContract("rent")}
          />
        </div>

        {/* PRICES */}
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card title="Petrol (95)" value={`${fmtGBP(petrol || 0)} `} suffix="/ litre" />
          <Card title="Diesel" value={`${fmtGBP(diesel || 0)} `} suffix="/ litre" />
          <Card title="Estimated Total" value={fmtGBP(total || 0)} />
        </div>
        {priceErr && <p className="mt-2 text-rose-300 text-sm">Price load error: {priceErr}</p>}

        {/* FORM */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
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
                value={name}
                onChange={(e) => setName(e.target.value)}
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
                {(["none", "buy", "rent"] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setTankOpt(opt)}
                    className={`rounded-xl border px-4 py-2 ${
                      tankOpt === opt
                        ? "border-yellow-400 bg-yellow-400/10"
                        : "border-white/15 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    {opt === "none" ? "No tank" : opt.toUpperCase()}
                  </button>
                ))}
              </div>
              {tankOpt === "buy" && !buySigned && (
                <p className="mt-2 text-sm text-amber-300">
                  Contract required — start it from the Buy panel above.
                </p>
              )}
              {tankOpt === "rent" && rentStatus !== "approved" && (
                <p className="mt-2 text-sm text-rose-300">
                  Rental requires admin approval — start the contract from the Rent panel above first.
                </p>
              )}
            </Field>
          </div>

          {/* Terms + CTA */}
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 md:items-center">
            <label className="inline-flex items-center gap-3 text-sm text-white/80">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
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
                type="button"
                onClick={startCheckout}
                disabled={ctaDisabled}
                className={`rounded-xl px-5 py-2 font-semibold ${
                  ctaDisabled
                    ? "cursor-not-allowed bg-yellow-500/50 text-[#041F3E]"
                    : "bg-yellow-500 text-[#041F3E] hover:bg-yellow-400"
                }`}
              >
                Pay with Stripe
              </button>
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-center py-10 text-sm text-white/60">
          © {new Date().getFullYear()} FuelFlow. All rights reserved.
        </footer>
      </section>

      {/* Contract modal */}
      {showContract && (
        <ContractModal
          option={showContract}
          onClose={() => setShowContract(null)}
          onSigned={() => {
            if (showContract === "buy") setBuySigned(true);
            if (showContract === "rent") setRentStatus("signed");
            setShowContract(null);
          }}
        />
      )}
    </main>
  );
}

/* ---------- small helpers/components ---------- */
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

function Panel({
  title,
  selected,
  onSelect,
  onOpenROI,
  onStartContract,
  dimmed,
  badge,
}: {
  title: string;
  selected: boolean;
  onSelect: () => void;
  onOpenROI: () => void;
  onStartContract: () => void;
  dimmed?: boolean;
  badge?: string;
}) {
  return (
    <div
      className={`relative rounded-2xl border p-6 ${
        selected ? "border-yellow-400 bg-white/5" : "border-white/10 bg-white/5"
      } ${dimmed ? "opacity-60 pointer-events-none" : ""}`}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-semibold">{title}</h3>
        <button
          type="button"
          onClick={onSelect}
          className={`rounded-xl px-3 py-1 text-sm ${
            selected ? "bg-yellow-400 text-[#041F3E]" : "border border-white/20 bg-white/10"
          }`}
        >
          {selected ? "Selected" : "Select"}
        </button>
      </div>

      {badge && <div className="mt-2 text-sm text-amber-300">{badge}</div>}

      <ul className="mt-4 space-y-2 text-white/80">
        <li className="flex gap-2"><span>✔</span><span>One-time cost with full ownership.</span></li>
        <li className="flex gap-2"><span>✔</span><span>Variety of sizes and specifications.</span></li>
        <li className="flex gap-2"><span>✔</span><span>Best for long-term sites and high-volume usage.</span></li>
      </ul>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onOpenROI}
          className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 hover:bg-white/15"
        >
          Open ROI
        </button>
        <button
          type="button"
          onClick={onStartContract}
          className="rounded-xl bg-yellow-500 px-4 py-2 font-semibold text-[#041F3E] hover:bg-yellow-400"
        >
          Start Contract
        </button>
      </div>
    </div>
  );
}

/* ------------------------- Contract Modal UI ------------------------- */
function ContractModal({
  option,
  onClose,
  onSigned,
}: {
  option: "buy" | "rent";
  onClose: () => void;
  onSigned: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [signature, setSignature] = useState("");
  const [accept, setAccept] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function submit() {
    setMsg(null);
    if (!fullName || !email || !signature || !accept) {
      setMsg({ type: "err", text: "Please complete name, email, signature and accept the terms." });
      return;
    }
    if (!captchaToken) {
      setMsg({ type: "err", text: "Please complete the captcha." });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          email,
          option,
          signature_name: signature,
          terms_version: "v1",
          hcaptchaToken: captchaToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to save contract.");
      setMsg({ type: "ok", text: "Contract signed and saved." });
      setTimeout(onSigned, 700);
    } catch (e: any) {
      setMsg({ type: "err", text: e?.message || "Failed to save contract." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-[101] w-[min(980px,94vw)] rounded-2xl border border-white/10 bg-[#0E2E57] shadow-2xl">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-white/10 bg-[#0A2446]">
          <img src="/logo-email.png" alt="FuelFlow" className="h-7 w-auto" />
          <h2 className="text-lg font-semibold text-white">
            FuelFlow {option === "buy" ? "Purchase" : "Rental"} Contract
          </h2>
          <button onClick={onClose} className="ml-auto rounded-lg px-3 py-1.5 text-white/70 hover:bg-white/10">✕</button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <Field label="Full name">
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full rounded-xl border border-white/15 bg-[#0A2446] p-2 outline-none" />
            </Field>
            <Field label="Email">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-white/15 bg-[#0A2446] p-2 outline-none" />
            </Field>
            <Field label="Type your full legal name as signature">
              <input value={signature} onChange={(e) => setSignature(e.target.value)} className="w-full rounded-xl border border-white/15 bg-[#0A2446] p-2 outline-none" />
            </Field>
            <label className="inline-flex items-center gap-3 text-sm text-white/80">
              <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} className="h-4 w-4 accent-yellow-500" />
              <span>
                I confirm I am authorised and I accept FuelFlow’s{" "}
                <a href="/terms" target="_blank" className="underline">Terms &amp; Conditions</a>.
              </span>
            </label>
            <HCaptcha
              sitekey={process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY || ""}
              onVerify={setCaptchaToken}
              onExpire={() => setCaptchaToken("")}
              onClose={() => setCaptchaToken("")}
            />
            {msg && <p className={msg.type === "ok" ? "text-green-400" : "text-red-300"}>{msg.text}</p>}
          </div>

          <div className="text-sm text-white/80 space-y-2">
            <h3 className="text-white font-semibold mb-2">Key terms (summary)</h3>
            <ul className="space-y-2">
              <li>• Equipment safe/compliant; partner install if needed.</li>
              <li>• Rental equipment remains our/partner property.</li>
              <li>• Use reasonable care; report incidents immediately.</li>
              <li>• Deliveries subject to availability & access.</li>
              <li>• Prices vary with market until order confirmation.</li>
              <li>• {option === "buy" ? "Buy is a one-off purchase (no approval step)." : "Rent requires admin approval before payment."}</li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 bg-[#0A2446] px-6 py-3 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 hover:bg-white/10">Cancel</button>
          <button
            onClick={submit}
            disabled={submitting}
            className="rounded-xl bg-yellow-500 px-4 py-2 font-semibold text-[#041F3E] hover:bg-yellow-400 disabled:opacity-60"
          >
            {submitting ? "Saving…" : "Sign & Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
