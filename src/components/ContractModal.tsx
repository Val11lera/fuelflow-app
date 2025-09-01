'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  option: 'buy' | 'rent';
  jwt?: string;
  onClose: () => void;
};

export default function ContractModal({ option, jwt, onClose }: Props) {
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    address1: '',
    address2: '',
    city: '',
    postcode: '',
    signature_name: '',
    hcaptchaToken: '', // set this from your hCaptcha widget
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true); setError(null);
    try {
      const res = await fetch('/api/contracts/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) },
        body: JSON.stringify({ ...form, tank_option: option, terms_version: 'v1' }),
      });
      const json = await res.json();
      if (!res.ok || json?.error) setError(json?.error || 'Could not sign contract');
      else { onClose(); router.refresh(); }
    } catch (e: any) {
      setError(e?.message || 'Network error');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-[#0d2840] p-6 text-white shadow-xl">
        <h2 className="text-xl font-semibold mb-4">
          {option === 'rent' ? 'FuelFlow Rental Contract' : 'FuelFlow Purchase Contract'}
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <input className="input" placeholder="Full name"
            value={form.full_name} onChange={e => setForm(v => ({ ...v, full_name: e.target.value }))} />
          <input className="input" placeholder="Email"
            value={form.email} onChange={e => setForm(v => ({ ...v, email: e.target.value }))} />
          <input className="input col-span-2" placeholder="Address line 1"
            value={form.address1} onChange={e => setForm(v => ({ ...v, address1: e.target.value }))} />
          <input className="input col-span-2" placeholder="Address line 2"
            value={form.address2} onChange={e => setForm(v => ({ ...v, address2: e.target.value }))} />
          <input className="input" placeholder="City"
            value={form.city} onChange={e => setForm(v => ({ ...v, city: e.target.value }))} />
          <input className="input" placeholder="Postcode"
            value={form.postcode} onChange={e => setForm(v => ({ ...v, postcode: e.target.value }))} />
          <input className="input col-span-2" placeholder="Type your full legal name as signature"
            value={form.signature_name} onChange={e => setForm(v => ({ ...v, signature_name: e.target.value }))} />
        </div>

        {/* your hCaptcha widget should set form.hcaptchaToken */}

        {error && <p className="text-red-300 mt-3">{error}</p>}

        <div className="mt-6 flex gap-3 justify-end">
          <button className="btn" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={submitting}>
            {option === 'rent' ? 'Sign & Apply' : 'Sign & Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
