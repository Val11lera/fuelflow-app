// src/pages/checkout/test.tsx
export default function TestCheckout() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Test Checkout</h1>

      {/* This form posts to the API route above */}
      <form action="/api/stripe/checkout/test" method="POST">
        {/* optional fields you can pass */}
        <input type="hidden" name="order_id" value="00000000-0000-0000-0000-000000000000" />
        <input type="hidden" name="amount" value="5000" />
        <input type="hidden" name="currency" value="gbp" />
        <button type="submit" style={{ fontSize: 18, padding: "10px 16px" }}>
          Pay £50.00 (test)
        </button>
      </form>
    </main>
  );
}


