// src/pages/checkout/test.tsx
import { useState } from 'react';

export default function TestCheckout() {
  const [loading, setLoading] = useState(false);

  async function startCheckout() {
    try {
      setLoading(true);
      const resp = await fetch('/api/checkout/create-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'buyer@example.com',
          product: 'Fuel order (test)',
          amount_pence: 5000, // £50.00
          currency: 'gbp',
        }),
      });
      const data = await resp.json();
      if (data.url) window.location.href = data.url;
      else alert('Failed: ' + JSON.stringify(data));
    } catch (e) {
      alert(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Test Checkout</h1>
      <button disabled={loading} onClick={startCheckout}>
        {loading ? 'Redirecting…' : 'Pay £50.00 (test)'}
      </button>
    </div>
  );
}
