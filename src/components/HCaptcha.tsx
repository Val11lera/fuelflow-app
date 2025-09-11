"use client";
import React, { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    hcaptcha?: {
      render: (el: HTMLElement, opts: any) => number;
      reset: (id?: number) => void;
      getResponse: (id?: number) => string;
      onLoad?: () => void;
    };
  }
}

type Props = {
  sitekey: string;
  theme?: "light" | "dark";
  size?: "normal" | "compact" | "invisible";
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
  className?: string;
};

export default function HCaptcha({
  sitekey,
  theme = "dark",
  size = "normal",
  onVerify,
  onExpire,
  onError,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<number | null>(null);
  const [loaded, setLoaded] = useState<boolean>(false);

  useEffect(() => {
    const ensureScript = () =>
      new Promise<void>((resolve) => {
        if (window.hcaptcha) return resolve();
        const s = document.createElement("script");
        s.src = "https://js.hcaptcha.com/1/api.js?render=explicit&recaptchacompat=off";
        s.async = true;
        s.defer = true;
        s.onload = () => resolve();
        document.head.appendChild(s);
      });

    let cancelled = false;
    (async () => {
      await ensureScript();
      if (cancelled) return;
      setLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loaded || !containerRef.current || !window.hcaptcha) return;
    if (widgetIdRef.current != null) return; // already rendered

    const id = window.hcaptcha.render(containerRef.current, {
      sitekey,
      theme,
      size,
      callback: (token: string) => onVerify(token),
      "expired-callback": () => onExpire?.(),
      "error-callback": () => onError?.(),
    });

    widgetIdRef.current = id;
  }, [loaded, sitekey, theme, size, onVerify, onExpire, onError]);

  return <div ref={containerRef} className={className} />;
}
