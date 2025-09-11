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

const HCaptcha: React.FC<Props> = ({
  sitekey,
  onVerify,
  onExpire,
  theme = "dark",
  size = "normal",
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<number | null>(null);

  // Load the script once (client only)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const id = "hcaptcha-script";
    if (!document.getElementById(id)) {
      const s = document.createElement("script");
      s.id = id;
      s.src = "https://hcaptcha.com/1/api.js?render=explicit";
      s.async = true;
      s.defer = true;
      document.body.appendChild(s);
    }
  }, []);

  // Render the widget when script is ready
  useEffect(() => {
    if (typeof window === "undefined") return;

    const renderWhenReady = () => {
      if (!window.hcaptcha || !containerRef.current) {
        requestAnimationFrame(renderWhenReady);
        return;
      }
      if (widgetIdRef.current != null) return;

      // Types come from our .d.ts file
      widgetIdRef.current = window.hcaptcha.render(containerRef.current, {
        sitekey,
        theme,
        size,
        callback: (token: string) => onVerify(token),
        "expired-callback": () => onExpire?.(),
      }) as unknown as number;
    };

    renderWhenReady();
  }, [sitekey, theme, size, onVerify, onExpire]);

  return <div ref={containerRef} className="h-captcha" />;
};

export default HCaptcha;
