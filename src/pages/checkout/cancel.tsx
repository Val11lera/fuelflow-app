// src/pages/checkout/cancel.tsx
export default function CancelPage() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Payment canceled</h1>
      <p>No charge was made.</p>
      <p><a href="/checkout/test">Back to test checkout</a></p>
    </main>
  );
}
