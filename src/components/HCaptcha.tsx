import React, { useEffect, useRef } from "react";

declare global {
  interface Window {
    hcaptcha?: {
      render: (el: HTMLElement, opts: any) => string | number;
      reset: (id?: string | number) => void;
      getResponse: (id?: string | number) => string;
      execute: (id?: string | number) => void;
      remove: (id?: string | number) => void;
    };
    onHCaptchaLoad?: () => void;
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
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | number | null>(null);
  const scriptLoaded = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const render = () => {
      if (!containerRef.current || !window.hcaptcha || widgetId.current != null) return;
      widgetId.current = window.hcaptcha.render(containerRef.current, {
        sitekey,
        theme,
        size,
        "callback": (token: string) => onVerify(token),
        "expired-callback": () => onExpire?.(),
        "error-callback": () => onError?.(),
      });
    };

    if (window.hcaptcha) {
      render();
      return;
    }

    if (scriptLoaded.current) return;
    scriptLoaded.current = true;

    const script = document.createElement("script");
    script.src = "https://js.hcaptcha.com/1/api.js?onload=onHCaptchaLoad&render=explicit";
    script.async = true;
    script.defer = true;

    window.onHCaptchaLoad = () => render();
    document.head.appendChild(script);

    return () => {
      try {
        if (widgetId.current != null && window.hcaptcha) {
          window.hcaptcha.remove(widgetId.current);
        }
      } catch {}
    };
  }, [sitekey, theme, size, onVerify, onExpire, onError]);

  return <div ref={containerRef} className={className} />;
}
