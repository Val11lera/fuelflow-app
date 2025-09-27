export default function Blocked() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0b1220", color: "white" }}>
      <div style={{ padding: 16, border: "1px solid #ffffff22", borderRadius: 12, background: "rgba(255,255,255,0.04)" }}>
        <h1 style={{ margin: 0, fontSize: 20, marginBottom: 8 }}>Access blocked</h1>
        <p style={{ margin: 0, opacity: 0.8 }}>
          Your account is currently blocked. Please contact support if you believe this is a mistake.
        </p>
      </div>
    </main>
  );
}
