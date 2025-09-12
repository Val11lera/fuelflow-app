import type { AppProps } from "next/app";
import "@/styles/globals.css"; // the ONLY global CSS import

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
