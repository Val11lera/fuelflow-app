import { useState } from "react";
import HCaptcha from "@hcaptcha/react-hcaptcha";

export default function Quote() {
  const [form, setForm] = useState({ name: "", email: "", address: "" });
  const [captchaToken, setCaptchaToken] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = () => {
    if (!captchaToken) return setMessage("Please complete the captcha.");
    // TODO: submit to your sheet or API
    setMessage("Quote request sent. We’ll be in touch shortly.");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#041F3E] text-white">
      <h1 className="text-3xl font-bold mb-6">Request a Quote</h1>
      <div className="bg-[#0E2E57] p-8 rounded-md w-full max-w-md">
        <input
          type="text"
          placeholder="Full Name"
          className="w-full mb-3 p-2 border rounded"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          type="email"
          placeholder="Email Address"
          className="w-full mb-3 p-2 border rounded"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <textarea
          placeholder="Delivery Address"
          className="w-full mb-3 p-2 border rounded"
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
        />
        <HCaptcha
          sitekey={process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY || ""}
          onVerify={setCaptchaToken}
        />
        <button
          onClick={handleSubmit}
          className="w-full bg-yellow-500 text-[#041F3E] mt-4 py-2 rounded font-semibold"
        >
          Submit Request
        </button>
        {message && <p className="mt-3 text-center">{message}</p>}
      </div>
    </div>
  );
}
