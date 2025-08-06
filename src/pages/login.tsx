import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import type HCaptchaType from "@hcaptcha/react-hcaptcha";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [message, setMessage] = useState("");
  const captchaRef = useRef<HCaptchaType>(null);

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        router.replace("/client-dashboard"); // ✅ redirect if already logged in
      }
    };
    checkSession();
  }, [router]);

  const handleLogin = async () => {
    if (!captchaToken) {
      setMessage("Please complete the captcha.");
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken },
    });

    if (error) {
      setMessage("Login failed: " + error.message);
      captchaRef.current?.resetCaptcha();
      setCaptchaToken("");
    } else {
      router.push("/client-dashboard");
    }
  };

  return (
    // ... your existing login form
  );
}



