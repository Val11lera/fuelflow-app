import { useRouter } from "next/router";
import { useEffect, useState, useRef } from "react";
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
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        console.log("Already authenticated — redirecting to dashboard");
        router.replace("/client-dashboard");
      }
    });
  }, [router]);

  const handleLogin = async () => {
    console.log("Login attempt:", { email, password, captchaToken });

    if (!captchaToken) {
      setMessage("Please complete the captcha.");
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken },
    });

    console.log("SignIn response:", { error, session: data?.session });

    if (error) {
      console.error("Login error:", error.message);
      setMessage("Login failed: " + error.message);
      captchaRef.current?.resetCaptcha();
      setCaptchaToken("");
    } else {
      console.log("Login successful — redirecting...");
      setMessage("Login successful!");
      router.push("/client-dashboard");
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-white">
      {/* UI elements omitted for brevity */}
    </div>
  );
}


