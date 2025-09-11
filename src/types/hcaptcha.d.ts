// src/types/hcaptcha.d.ts
// src/types/hcaptcha.d.ts
export {};

interface HCaptchaAPI {
  render: (el: HTMLElement, opts: any) => string | number;
  reset: (id?: string | number) => void;
  getResponse: (id?: string | number) => string;
}

declare global {
  interface Window {
    hcaptcha?: HCaptchaAPI;
  }
}
