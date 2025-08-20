// src/pages/checkout/cancel.tsx
export default function CancelPage() {
  return (
    <main className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-xl mx-auto bg-gray-800 rounded-xl p-6 shadow-lg">
        <h1 className="text-2xl font-semibold mb-2">Payment canceled</h1>
        <p className="text-gray-300 mb-6">No charge was made.</p>
        <div className="flex gap-3">
          <a
            href="/order"
            className="bg-yellow-500 text-black px-4 py-2 rounded hover:bg-yellow-400"
          >
            Back to Order
          </a>
          <a
            href="/client-dashboard"
            className="bg-gray-700 px-4 py-2 rounded hover:bg-gray-600"
          >
            Dashboard
          </a>
        </div>
      </div>
    </main>
  );
}
