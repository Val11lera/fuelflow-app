// src/pages/contracts/[id].tsx
// src/pages/contracts/[id].tsx
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

type ContractRow = {
  id: string;
  tank_option: "buy" | "rent";
  status: "draft" | "signed" | "approved" | "cancelled";
  pdf_url?: string | null;
  pdf_storage_path?: string | null;
  created_at?: string | null;
};

export default function ContractViewer() {
  const router = useRouter();
  const { id } = router.query as { id?: string };
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [contract, setContract] = useState<ContractRow | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const { data, error } = await supabase
          .from("contracts")
          .select("id,tank_option,status,pdf_url,pdf_storage_path,created_at")
          .eq("id", id)
          .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error("Contract not found.");
        setContract(data as ContractRow);

        if (data.pdf_url) {
          setSignedUrl(data.pdf_url);
          return;
        }
        if (data.pdf_storage_path) {
          const { data: signed, error: signErr } = await supabase.storage
            .from("contracts")
            .createSignedUrl(data.pdf_storage_path, 60 * 10);
          if (signErr) throw signErr;
          setSignedUrl(signed?.signedUrl || null);
        } else {
          throw new Error("No PDF available for this contract.");
        }
      } catch (e: any) {
        setErr(e?.message || "Failed to load contract.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  return (
    <main className="min-h-screen bg-[#0a0f1c] text-white">
      <div className="mx-auto max-w-6xl px-4 py-4">
        <div className="flex items-center gap-3 mb-4">
          <img src="/logo-email.png" alt="FuelFlow" className="h-7" />
          <div className="text-xl font-semibold">Contract</div>
          <div className="ml-auto">
            <Link href="/documents" className="text-white/70 hover:text-white">
              Back to documents
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="rounded-xl bg-white/5 p-4">Loading…</div>
        ) : err ? (
          <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-red-200">{err}</div>
        ) : (
          <>
            <div className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10 mb-3 text-sm text-white/70">
              ID: <span className="text-white">{contract?.id}</span> · Type: <b>{contract?.tank_option}</b> · Status: <b>{contract?.status}</b>
            </div>

            {signedUrl ? (
              <div className="rounded-xl overflow-hidden ring-1 ring-white/10 bg-black/40">
                <iframe src={signedUrl} className="w-full h-[80vh]" title="Contract PDF" />
              </div>
            ) : (
              <div className="rounded-xl bg-white/5 p-4">No PDF available.</div>
            )}

            {signedUrl && (
              <div className="mt-3">
                <a
                  href={signedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex rounded-xl bg-yellow-400 text-[#0a0f1c] px-4 py-2 font-semibold"
                >
                  Download PDF
                </a>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

