import Head from 'next/head';

export default function TestCheckout() {
  return (
    <>
      <Head>
        <title>Test Checkout</title>
      </Head>
      <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
        <h1>Test Checkout</h1>

        {/* This form POSTs to your API route that creates a Checkout Session */}
        <form action="/api/stripe/checkout/test" method="POST">
          {/* Optional: pass an order_id so the webhook can link to orders */}
          {/* <input type="hidden" name="order_id" value="c8c9...e432" /> */}

          <button
            type="submit"
            style={{
              marginTop: '1rem',
              padding: '0.75rem 1.25rem',
              fontSize: '1.1rem',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            Pay £50.00 (test)
          </button>
        </form>
      </main>
    </>
  );
}

