// src/pages/_app.tsx
import type { AppProps } from "next/app";

// The ONLY place where global CSS is imported on Pages Router
import "@/styles/globals.css";

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
