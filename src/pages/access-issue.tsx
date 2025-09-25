// src/pages/access-issue.tsx
export default function AccessIssue() {
  const status =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("status") || "blocked"
      : "blocked";

  return (
    <div className="min-h-screen grid place-items-center bg-[#0b1220] text-white p-6">
      <div className="max-w-md rounded-2xl border border-white/10 bg-white/[0.05] p-6">
        <h1 className="text-xl font-semibold mb-2">
          {status === "suspended" ? "Account suspended" : "Account blocked"}
        </h1>
        <p className="text-white/70">
          Your access has been restricted. If you believe this is a mistake, please contact{" "}
          <a className="underline" href="mailto:support@fuelflow.co.uk">
            support@fuelflow.co.uk
          </a>.
        </p>
      </div>
    </div>
  );
}
