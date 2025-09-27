export default function Pending() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0b1220", color: "white" }}>
      <div style={{ padding: 16, border: "1px solid #ffffff22", borderRadius: 12, background: "rgba(255,255,255,0.04)" }}>
        <h1 style={{ margin: 0, fontSize: 20, marginBottom: 8 }}>Approval pending</h1>
        <p style={{ margin: 0, opacity: 0.8 }}>
          Your account hasn’t been approved yet. You’ll get access as soon as an admin approves your email.
        </p>
      </div>
    </main>
  );
}
