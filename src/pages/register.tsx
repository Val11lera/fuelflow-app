import { useState } from "react";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [message, setMessage] = useState("");

  const handleRegister = async () => {
    if (!captchaToken) return setMessage("Please complete the captcha.");
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { captchaToken },
    });
    if (error) setMessage(error.message);
    else setMessage("Registration successful. Check your email link.");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#041F3E] text-white">
      <h1 className="text-3xl font-bold mb-6">Create a Client Account</h1>
      <div className="bg-[#0E2E57] p-8 rounded-md w-full max-w-md">
        <input
          type="email"
          placeholder="Email Address"
          className="w-full mb-3 p-2 border rounded"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          className="w-full mb-3 p-2 border rounded"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <HCaptcha
          sitekey={process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY || ""}
          onVerify={setCaptchaToken}
        />
        <button
          onClick={handleRegister}
          className="w-full bg-yellow-500 text-[#041F3E] mt-4 py-2 rounded font-semibold"
        >
          Register
        </button>
        {message && <p className="mt-3 text-center">{message}</p>}
      </div>
    </div>
  );
}
