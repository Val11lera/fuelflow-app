import { useState, useRef } from "react";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

export default function Login() {
  const captchaRef = useRef(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [message, setMessage] = useState("");

  const handleLogin = async () => {
    if (!captchaToken) {
      setMessage("Please complete the captcha.");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken },
    });

    if (error) {
      setMessage(error.message);
      captchaRef.current?.resetCaptcha(); // reset captcha if login fails
      setCaptchaToken(""); // ensure fresh token
    } else {
      setMessage("Login successful!");
      // redirect to dashboard here if needed
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6">
      <h1 className="text-2xl font-bold mb-4">Client Login</h1>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="mb-2 p-2 border rounded w-full max-w-sm"
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="mb-2 p-2 border rounded w-full max-w-sm"
      />
      <HCaptcha
        sitekey={process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY || ""}
        onVerify={setCaptchaToken}
        ref={captchaRef}
      />
      <button
        onClick={handleLogin}
        className="mt-4 bg-blue-600 text-white px-6 py-2 rounded"
      >
        Sign In
      </button>
      {message && <p className="mt-3 text-red-500">{message}</p>}
    </div>
  );
}


