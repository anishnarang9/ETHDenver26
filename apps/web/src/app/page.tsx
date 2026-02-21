"use client";

import { SetupWizard } from "../components/setup-wizard";

export default function HomePage() {
  return (
    <main
      className="noise-overlay"
      style={{
        minHeight: "100vh",
        background: "#0a0a0f",
        color: "#e2e8f0",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "56px 24px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* ── Gradient mesh background ── */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          background: [
            "radial-gradient(ellipse 80% 60% at 10% 20%, rgba(59,130,246,0.08) 0%, transparent 60%)",
            "radial-gradient(ellipse 60% 50% at 85% 15%, rgba(139,92,246,0.07) 0%, transparent 55%)",
            "radial-gradient(ellipse 50% 40% at 50% 85%, rgba(56,189,248,0.05) 0%, transparent 50%)",
            "radial-gradient(ellipse 70% 50% at 70% 60%, rgba(129,140,248,0.04) 0%, transparent 50%)",
          ].join(", "),
        }}
      />

      {/* ── Floating ambient orbs ── */}
      <div
        style={{
          position: "fixed",
          top: "8%",
          left: "12%",
          width: 320,
          height: 320,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(59,130,246,0.12) 0%, transparent 70%)",
          filter: "blur(60px)",
          animation: "float-drift 20s ease-in-out infinite",
          zIndex: 0,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "fixed",
          top: "55%",
          right: "8%",
          width: 260,
          height: 260,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(139,92,246,0.10) 0%, transparent 70%)",
          filter: "blur(50px)",
          animation: "float-drift 25s ease-in-out infinite reverse",
          zIndex: 0,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "fixed",
          bottom: "10%",
          left: "40%",
          width: 200,
          height: 200,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(56,189,248,0.06) 0%, transparent 70%)",
          filter: "blur(40px)",
          animation: "float-drift 18s ease-in-out infinite",
          animationDelay: "-5s",
          zIndex: 0,
          pointerEvents: "none",
        }}
      />

      {/* ── Content container ── */}
      <div style={{ position: "relative", zIndex: 1, width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
        {/* Header with glow aura */}
        <div style={{ textAlign: "center", marginBottom: 48, position: "relative" }}>
          {/* Glow behind title */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: 280,
              height: 80,
              background: "radial-gradient(ellipse, rgba(59,130,246,0.15) 0%, rgba(129,140,248,0.08) 40%, transparent 70%)",
              filter: "blur(30px)",
              pointerEvents: "none",
            }}
          />
          <h1
            style={{
              margin: 0,
              fontSize: "3rem",
              fontWeight: 800,
              background: "linear-gradient(135deg, #38bdf8 0%, #818cf8 50%, #c084fc 100%)",
              backgroundSize: "200% 200%",
              animation: "gradient-shift 8s ease-in-out infinite",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              letterSpacing: "-0.03em",
              position: "relative",
            }}
          >
            TripDesk
          </h1>
          <p
            style={{
              margin: "10px 0 0",
              fontSize: "1.05rem",
              color: "#64748b",
              fontWeight: 400,
              letterSpacing: "0.02em",
            }}
          >
            AI Travel Agent Console
          </p>
        </div>

        {/* Setup Wizard */}
        <SetupWizard />
      </div>
    </main>
  );
}
