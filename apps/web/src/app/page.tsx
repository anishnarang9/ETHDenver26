"use client";

import { SetupWizard } from "../components/setup-wizard";

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0a0a0f",
        color: "#e2e8f0",
        fontFamily: "'Inter', sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "48px 24px",
      }}
    >
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <h1
          style={{
            margin: 0,
            fontSize: "2.4rem",
            fontWeight: 800,
            background: "linear-gradient(135deg, #38bdf8, #818cf8)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            letterSpacing: "-0.02em",
          }}
        >
          TripDesk
        </h1>
        <p
          style={{
            margin: "8px 0 0",
            fontSize: "1rem",
            color: "#64748b",
            fontWeight: 400,
          }}
        >
          AI Travel Agent Console
        </p>
      </div>

      {/* Setup Wizard */}
      <SetupWizard />
    </main>
  );
}
