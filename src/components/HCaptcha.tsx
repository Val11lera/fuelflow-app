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

declare global {
  interface Window {
    hcaptcha?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          theme?: "light" | "dark";
          size?: "normal" | "compact";
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          tabindex?: number;
        }
      ) => string | number;
      reset?: (id?: string | number) => void;
    };
  }
}

const HCaptcha: React.FC<Props> = ({
  sitekey,
  onVerify,
  onExpire,
  theme = "dark",
  size = "normal",
  tabindex,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | number | null>(null);

  useEffect(() => {
    const ensureScript = () =>
      new Promise<void>((resolve, reject) => {
        if (window.hcaptcha) {
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

    let mounted = true;

    (async () => {
      try {
        await ensureScript();
        if (!mounted || !window.hcaptcha || !containerRef.current) return;

        widgetIdRef.current = window.hcaptcha.render(containerRef.current, {
          sitekey,
          theme,
          size,
          tabindex,
          callback: (token: string) => onVerify(token),
          "expired-callback": () => onExpire?.(),
        });
      } catch (e) {
        // optionally log
      }
    })();

    return () => {
      mounted = false;
      // Optional: if you want, you can call window.hcaptcha?.reset(widgetIdRef.current as any)
    };
  }, [sitekey, theme, size, tabindex, onVerify, onExpire]);

  return <div ref={containerRef} />;
};

export default HCaptcha;

