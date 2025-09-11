// src/components/HCaptcha.tsx
"use client";

import React, { useEffect, useRef } from "react";

type Props = {
  sitekey: string;
  onVerify: (token: string) => void;
  onExpire?: () => void;
  theme?: "light" | "dark";
  size?: "normal" | "compact";
};

const SCRIPT_SRC = "https://js.hcaptcha.com/1/api.js?render=explicit";
const SCRIPT_ID = "__hcaptcha_script__";

let loadPromise: Promise<void> | null = null;
function loadHCaptcha(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as any).hcaptcha?.render) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("hCaptcha failed to load")), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("hCaptcha failed to load"));
    document.head.appendChild(s);
  });

  return loadPromise;
}

const HCaptcha: React.FC<Props> = ({
  sitekey,
  onVerify,
  onExpire,
  theme = "dark",
  size = "normal",
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function mount() {
      if (typeof window === "undefined") return;
      await loadHCaptcha();
      if (cancelled || !containerRef.current) return;

      const w: any = window;
      if (widgetIdRef.current == null) {
        widgetIdRef.current = w.hcaptcha.render(containerRef.current, {
          sitekey,
          theme,
          size,
          callback: (token: string) => onVerify?.(token),
          "expired-callback": () => {
            onExpire?.();
            try {
              if (widgetIdRef.current != null) w.hcaptcha?.reset(widgetIdRef.current);
            } catch {}
          },
        });
      }
    }
    mount();

    return () => {
      cancelled = true;
      try {
        const w: any = window;
        if (w?.hcaptcha && widgetIdRef.current != null) w.hcaptcha.reset(widgetIdRef.current);
      } catch {}
    };
  }, [sitekey, theme, size, onVerify, onExpire]);

  return <div ref={containerRef} style={{ minHeight: 78 }} />;
};

export default HCaptcha;

