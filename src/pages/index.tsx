// src/pages/documents/index.tsx
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

/* =========================
   Types & setup
   ========================= */
type TankOption = "buy" | "rent";
type ContractStatus = "draft" | "signed" | "approved" | "cancelled";

type ContractRow = {
  id: string;
  tank_option: TankOption;
  status: ContractStatus;
  signed_at: string | null;
  approved_at: string | null;
  created_at: string | null;
  email: string | null;
  pdf_url?: string | null;
  pdf_storage_path?: string | null;
};

const TERMS_VERSION = "v1.1";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

function shortDate(d?: string | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString();
  } catch {
    return "—";
  }
}
function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/* =========================
   Page
   ========================= */
export default function DocumentsPage() {
  const [email, setEmail] = useState<string>("");
  const [termsAcceptedAt, setTermsAcceptedAt] = useState<string | null>(null);
  const [buy, setBuy] = useState<ContractRow | null>(null);
  const [rent, setRent] = useState<ContractRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        // auth
        const { data: auth } = await supabase.auth.getUser();
        const em = (auth?.user?.email || "").toLowerCase();
        if (!em) {
          window.location.href = "/login";
          return;
        }
        setEmail(em);

        // terms
        const { data: t, error: tErr } = await supabase
          .from("terms_acceptances")
          .select("accepted_at")
          .eq("email", em)
          .eq("version", TERMS_VERSION)
          .order("accepted_at", { ascending: false })
          .limit(1);
        if (tErr) throw tErr;
        setTermsAcceptedAt(t?.[0]?.accepted_at ?? null);

        // contracts
        const { data: rows, error: cErr } = await supabase
          .from("contracts")
          .select(
            "id,tank_option,status,signed_at,approved_at,created_at,email,pdf_url,pdf_storage_path"
          )
          .eq("email", em)
          .order("created_at", { ascending: false });
        if (cErr) throw cErr;

        const list = (rows || []) as ContractRow[];
        const latestBuy =
          list.find(
            (r) =>
              r.tank_option === "buy" &&
              (r.status === "approved" || r.status === "signed")
          ) ??
          list.find((r) => r.tank_option === "buy") ??
          null;
        const latestRent =
          list.find(
            (r) =>
              r.tank_option === "rent" &&
              (r.status === "approved" || r.status === "signed")
          ) ??
          list.find((r) => r.tank_option === "rent") ??
          null;

        setBuy(latestBuy);
        setRent(latestRent);
      } catch (e: any) {
        setErr(e?.message || "Failed to load documents.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const badge = (tone: "ok" | "warn" | "missing", label: string) => (
    <span
      className={cx(
        "text-xs rounded-full px-2 py-0.5",
        tone === "ok" && "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20",
        tone === "warn" && "bg-yellow-500/15 text-yellow-300 ring-1 ring-yellow-400/20",
        tone === "missing" && "bg-red-500/15 text-red-300 ring-1 ring-red-400/20"
      )}
    >
      {label}
    </span>
  );

  const termsTone = termsAcceptedAt ? "ok" : "missing";
  const buyTone = !buy ? "missing" : buy.status === "approved" ? "ok" : "warn";
  const rentTone = !rent ? "missing" : rent.status === "approved" ? "ok" : "warn";

  const ctaHref = (c: ContractRow | null, option: "buy" | "rent") =>
    c && (c.pdf_url || c.pdf_storage_path) ? `/contracts/${c.id}` : `/order?wizard=${option}`;

  return (
    <main className="min-h-screen bg-[#0a0f1c] text-white">
      {/* subtle top glow */}
      <div aria-hidden className="pointer-events-none fixed inset-x-0 -top-40 h-72 bg-gradient-to-b from-yellow-400/10 blur-3xl" />

      <div className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <img src="/logo-email.png" alt="FuelFlow" className="h-7" />
          <h1 className="text-xl md:text-2xl font-semibold">Documents</h1>
          <div className="ml-auto">
            <Link
              href="/client-dashboard"
              className="rounded-xl bg-white/10 hover:bg-white/15 px-4 py-2 text-sm font-semibold"
            >
              ← Back to dashboard
            </Link>
          </div>
        </div>

        <section className="rounded-2xl bg-[#0e1627] p-5 ring-1 ring-white/10">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-40 rounded-2xl bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : err ? (
            <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-red-200">
              {err}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 auto-rows-fr">
              {/* Terms */}
              <DocCard
                icon={<DocIcon />}
                title="Terms & Conditions"
                subtitle={
                  termsAcceptedAt
                    ? `Accepted · ${shortDate(termsAcceptedAt)}`
                    : "You must accept before ordering"
                }
                badgeEl={badge(
                  termsTone as any,
                  termsAcceptedAt ? "Accepted" : "Missing"
                )}
                cta={{
                  label: termsAcceptedAt ? "View" : "Read & accept",
                  href: termsAcceptedAt
                    ? "/terms"
                    : `/terms?return=/documents/&email=${encodeURIComponent(email)}`,
                }}
              />

              {/* Buy */}
              <DocCard
                icon={<ShieldIcon />}
                title="Buy contract"
                subtitle={
                  !buy
                    ? "Sign once — then order anytime"
                    : buy.status === "approved"
                    ? `Active · ${shortDate(buy.approved_at)}`
                    : `Signed · ${shortDate(buy.signed_at)}`
                }
                badgeEl={badge(
                  buyTone as any,
                  !buy ? "Not signed" : buy.status === "approved" ? "Active" : "Signed"
                )}
                cta={{
                  label:
                    buy && (buy.pdf_url || buy.pdf_storage_path)
                      ? "Open PDF"
                      : !buy
                      ? "Start"
                      : "Manage",
                  href: ctaHref(buy, "buy"),
                }}
                muted={!buy}
              />

              {/* Rent */}
              <DocCard
                icon={<BuildingIcon />}
                title="Rent contract"
                subtitle={
                  !rent
                    ? "Needs admin approval after signing"
                    : rent.status === "approved"
                    ? `Active · ${shortDate(rent.approved_at)}`
                    : "Signed · awaiting approval"
                }
                badgeEl={badge(
                  rentTone as any,
                  !rent ? "Not signed" : rent.status === "approved" ? "Active" : "Signed"
                )}
                cta={{
                  label:
                    rent && (rent.pdf_url || rent.pdf_storage_path)
                      ? "Open PDF"
                      : !rent
                      ? "Start"
                      : "Manage",
                  href: ctaHref(rent, "rent"),
                }}
                muted={!rent}
              />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

/* =========================
   Card + Icons
   ========================= */
function DocCard({
  icon,
  title,
  subtitle,
  cta,
  badgeEl,
  muted,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  cta: { label: string; href: string };
  badgeEl: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div
      className={cx(
        "min-h-[168px] rounded-2xl p-4 ring-1 backdrop-blur flex flex-col",
        muted ? "ring-white/10 bg-white/5" : "ring-white/10 bg-white/10"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold leading-tight">{title}</h3>
            {badgeEl}
          </div>
          {subtitle && (
            <p className="text-xs text-white/70 mt-0.5 line-clamp-2">{subtitle}</p>
          )}
        </div>
      </div>
      <div className="mt-auto pt-3">
        <a
          href={cta.href}
          className="inline-flex items-center rounded-xl bg-white/10 hover:bg-white/15 px-4 py-2 font-semibold"
        >
          {cta.label}
        </a>
      </div>
    </div>
  );
}

function DocIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" className="text-white/80">
      <path
        fill="currentColor"
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm0 0v6h6"
        opacity=".6"
      />
      <path fill="currentColor" d="M8 13h8v2H8zm0-4h5v2H8zm0 8h8v2H8z" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" className="text-white/80">
      <path
        fill="currentColor"
        d="M12 2l7 4v6c0 5-3.5 9-7 10c-3.5-1-7-5-7-10V6z"
        opacity=".6"
      />
      <path
        fill="currentColor"
        d="M12 6l4 2v3c0 3.5-2.3 6.3-4 7c-1.7-.7-4-3.5-4-7V8z"
      />
    </svg>
  );
}
function BuildingIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" className="text-white/80">
      <path
        fill="currentColor"
        d="M3 21V7l9-4l9 4v14h-7v-5h-4v5z"
        opacity=".6"
      />
      <path
        fill="currentColor"
        d="M9 11h2v2H9zm4 0h2v2h-2zM9 15h2v2H9zm4 0h2v2h-2z"
      />
    </svg>
  );
}
