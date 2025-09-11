// src/components/HCaptcha.tsx
// src/components/HCaptcha.tsx
"use client";

import React, { useEffect, useRef } from "react";

type Props = {
  sitekey: string;
  onVerify: (token: string) => void;
  onExpire?: () => void;
  theme?: "light" | "dark";
  size?: "normal" | "compact";
  tabindex?: number;
};

const HCaptcha: React.FC<Props> = ({
  sitekey,
  onVerify,
  onExpire,
  theme = "dark",
  size = "normal",
  tabindex,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<any>(null);

  useEffect(() => {
    let mounted = true;

    const ensureScript = () =>
      new Promise<void>((resolve, reject) => {
        const w = window as any;
        if (w.hcaptcha) {
          resolve();
          return;
        }

        const existing = document.querySelector<HTMLScriptElement>(
          'script[src*="hcaptcha.com/1/api.js"]'
        );
        if (existing) {
          existing.addEventListener("load", () => resolve());
          existing.addEventListener("error", () =>
            reject(new Error("hCaptcha script failed to load"))
          );
          return;
        }

        const s = document.createElement("script");
        s.src = "https://js.hcaptcha.com/1/api.js?render=explicit";
        s.async = true;
        s.defer = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("hCaptcha script failed to load"));
        document.head.appendChild(s);
      });

    (async () => {
      try {
        await ensureScript();
        if (!mounted || !containerRef.current) return;

        const w = window as any;
        widgetIdRef.current = w.hcaptcha?.render(containerRef.current, {
          sitekey,
          theme,
          size,
          tabindex,
          callback: (token: string) => onVerify(token),
          "expired-callback": () => onExpire?.(),
        });
      } catch {
        // optionally log
      }
    })();

    return () => {
      mounted = false;
      // optional: (window as any).hcaptcha?.reset?.(widgetIdRef.current);
    };
  }, [sitekey, theme, size, tabindex, onVerify, onExpire]);

  return <div ref={containerRef} />;
};

export default HCaptcha;

