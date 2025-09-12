import type { AppProps } from "next/app";
// Import global CSS once here (Pages Router)
import "@/styles/globals.css";

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
