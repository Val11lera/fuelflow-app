import { useRef, useState } from "react";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import type HCaptchaType from "@hcaptcha/react-hcaptcha";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [message, setMessage] = useState("");
  const captchaRef = useRef<HCaptchaType>(null);

  const handleLogin = async () => {
    if (!captchaToken) {
      setMessage("Please complete the captcha.");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage("Login failed: " + error.message);
      captchaRef.current?.resetCaptcha();
      setCaptchaToken("");
    } else {
      setMessage("Login successful!");
      setTimeout(() => {
        window.location.href = "/client-dashboard";
      }, 1000);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-white">
      <div className="bg-white p-8 shadow-md rounded-md w-full max-w-md">
        <h2 className="text-2xl font-bold mb-4 text-center">Client Login</h2>
        <input
          type="email"
          placeholder="Email"
          className="w-full p-2 mb-3 border border-gray-300 rounded"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          className="w-full p-2 mb-3 border border-gray-300 rounded"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <HCaptcha
          sitekey={process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY || ""}
          onVerify={(token) => setCaptchaToken(token)}
          ref={captchaRef}
        />
        <button
          onClick={handleLogin}
          className="w-full mt-4 bg-blue-600 text-white p-2 rounded hover:bg-blue-700"
        >
          Sign In
        </button>
        {message && (
          <p className="text-center text-sm text-red-600 mt-3">{message}</p>
        )}
      </div>
    </div>
  );
}



