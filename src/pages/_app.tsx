// src/pages/_app.tsx
import "../styles/globals.css";      // <-- change this line
import type { AppProps } from "next/app";

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
