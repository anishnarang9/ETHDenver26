"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wallet,
  Coins,
  Shield,
  Key,
  Activity,
  Rocket,
  CheckCircle2,
  ArrowRight,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { BrowserProvider, type Eip1193Provider } from "ethers";
import { getTokenBalance } from "../lib/kite-rpc";
import { upsertPassportOnchain, grantSessionOnchain } from "../lib/onchain";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AgentWallet {
  name: string;
  address: string;
  color: string;
  balance: string;
}

interface StepState {
  completed: boolean;
  loading: boolean;
  error: string | null;
}

interface ServiceStatus {
  name: string;
  url: string;
  healthy: boolean | null;
  checking: boolean;
}

/* ------------------------------------------------------------------ */
/*  Agent wallets from env                                             */
/* ------------------------------------------------------------------ */

const AGENT_WALLETS: { name: string; envKey: string; color: string }[] = [
  { name: "Orchestrator", envKey: "NEXT_PUBLIC_PLANNER_ADDRESS", color: "#3b82f6" },
];

function getAgentAddress(envKey: string): string {
  const envMap: Record<string, string | undefined> = {
    NEXT_PUBLIC_PLANNER_ADDRESS: process.env.NEXT_PUBLIC_PLANNER_ADDRESS,
  };
  return envMap[envKey] || "";
}

/* ------------------------------------------------------------------ */
/*  Style constants                                                    */
/* ------------------------------------------------------------------ */

const C = {
  bg: "#0a0a0f",
  panel: "#111827",
  panelBorder: "#1e293b",
  panelGlass: "rgba(17,24,39,0.70)",
  glassBorder: "rgba(255,255,255,0.06)",
  glassHighlight: "rgba(255,255,255,0.03)",
  text: "#e2e8f0",
  textMuted: "#94a3b8",
  textDim: "#64748b",
  textDimmer: "#475569",
  accent: "#3b82f6",
  accentGlow: "rgba(59,130,246,0.15)",
  success: "#22c55e",
  successGlow: "rgba(34,197,94,0.15)",
  error: "#ef4444",
  errorGlow: "rgba(239,68,68,0.08)",
  cardBg: "#0f172a",
  purple: "#8b5cf6",
};

/* ------------------------------------------------------------------ */
/*  Step configuration                                                 */
/* ------------------------------------------------------------------ */

const STEP_CONFIG = [
  {
    title: "Connect Wallet",
    description: "Connect your MetaMask or injected wallet to get started.",
    icon: Wallet,
    color: "#3b82f6",
  },
  {
    title: "Fund Orchestrator",
    description: "Fund the orchestrator wallet using the Kite faucet. Sub-agents are funded dynamically at runtime.",
    icon: Coins,
    color: "#f59e0b",
  },
  {
    title: "Deploy Passport",
    description: "Deploy an on-chain passport for the orchestrator. Sub-agent passports are created dynamically.",
    icon: Shield,
    color: "#8b5cf6",
  },
  {
    title: "Create Session",
    description: "Grant a session key for the orchestrator to act within its authorized scopes.",
    icon: Key,
    color: "#22c55e",
  },
  {
    title: "Readiness Check",
    description: "Verify the orchestrator service is online and responding.",
    icon: Activity,
    color: "#0ea5e9",
  },
  {
    title: "Launch Console",
    description: "Everything is set up. Launch the TripDesk multi-agent console.",
    icon: Rocket,
    color: "#c084fc",
  },
];

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function SetupWizard() {
  const router = useRouter();

  // Step 1: Wallet connection
  const [connectedAddress, setConnectedAddress] = useState<string>("");

  // Step 2: Funding
  const [agentWallets, setAgentWallets] = useState<AgentWallet[]>([]);
  const [fundingPolling, setFundingPolling] = useState(false);

  // Step 3: Passport deploy
  const [passportStatuses, setPassportStatuses] = useState<
    Record<string, { status: "idle" | "pending" | "done" | "error"; txHash?: string; error?: string }>
  >({});

  // Step 4: Session creation
  const [sessionStatuses, setSessionStatuses] = useState<
    Record<string, { status: "idle" | "pending" | "done" | "error"; txHash?: string; error?: string }>
  >({});

  // Step 5: Readiness
  const [services, setServices] = useState<ServiceStatus[]>([
    {
      name: "Orchestrator",
      url: process.env.NEXT_PUBLIC_PLANNER_URL || "http://localhost:4005",
      healthy: null,
      checking: false,
    },
  ]);

  // Step completion state
  const [steps, setSteps] = useState<StepState[]>(
    STEP_CONFIG.map(() => ({ completed: false, loading: false, error: null }))
  );

  // Current active step
  const currentStep = steps.findIndex((s) => !s.completed);
  const allComplete = steps.every((s) => s.completed);
  const completedCount = steps.filter((s) => s.completed).length;
  const progressPercent = (completedCount / steps.length) * 100;

  /* ---------------------------------------------------------------- */
  /*  Step 1: Connect wallet                                           */
  /* ---------------------------------------------------------------- */

  const connectWallet = async () => {
    updateStep(0, { loading: true, error: null });
    try {
      const runtime = globalThis as unknown as {
        ethereum?: Eip1193Provider;
        window?: { ethereum?: Eip1193Provider };
      };
      const ethereum = runtime.window?.ethereum ?? runtime.ethereum;
      if (!ethereum) {
        throw new Error("No EVM wallet found. Install or unlock MetaMask.");
      }
      const provider = new BrowserProvider(ethereum);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      setConnectedAddress(address);
      updateStep(0, { completed: true, loading: false });
    } catch (err) {
      updateStep(0, { loading: false, error: (err as Error).message });
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Step 2: Fund wallets                                             */
  /* ---------------------------------------------------------------- */

  const fetchBalances = useCallback(async () => {
    const wallets: AgentWallet[] = [];
    for (const aw of AGENT_WALLETS) {
      const address = getAgentAddress(aw.envKey);
      if (!address) {
        console.warn(`[fund-wallets] ${aw.envKey} is empty — env var not set`);
        continue;
      }
      try {
        const balance = await getTokenBalance(address);
        wallets.push({ name: aw.name, address, color: aw.color, balance });
      } catch (err) {
        console.warn(`[fund-wallets] balance fetch failed for ${aw.name}:`, err);
        wallets.push({ name: aw.name, address, color: aw.color, balance: "0.00" });
      }
    }
    setAgentWallets(wallets);

    const allFunded = wallets.length > 0 && wallets.every((w) => parseFloat(w.balance) > 0);
    if (allFunded && steps[0].completed) {
      updateStep(1, { completed: true, loading: false });
    }

    return wallets;
  }, [steps]);

  useEffect(() => {
    if (currentStep === 1 && !fundingPolling) {
      setFundingPolling(true);
      fetchBalances();
    }
  }, [currentStep, fundingPolling, fetchBalances]);

  useEffect(() => {
    if (!fundingPolling) return;
    const interval = setInterval(fetchBalances, 8000);
    return () => clearInterval(interval);
  }, [fundingPolling, fetchBalances]);

  useEffect(() => {
    if (steps[0].completed && agentWallets.length === 0) {
      fetchBalances();
    }
  }, [steps, agentWallets.length, fetchBalances]);

  /* ---------------------------------------------------------------- */
  /*  Step 3: Deploy passports                                         */
  /* ---------------------------------------------------------------- */

  const deployPassports = async () => {
    updateStep(2, { loading: true, error: null });
    const wallets = agentWallets.filter((w) => w.address);
    let allDone = true;

    const seen = new Map<string, string>();
    for (const wallet of wallets) {
      const addr = wallet.address.toLowerCase();
      if (seen.has(addr)) {
        setPassportStatuses((prev) => ({
          ...prev,
          [wallet.name]: { status: "done", txHash: seen.get(addr) },
        }));
        continue;
      }

      setPassportStatuses((prev) => ({
        ...prev,
        [wallet.name]: { status: "pending" },
      }));
      try {
        const result = await upsertPassportOnchain({
          agentAddress: wallet.address,
          expiresAt: Math.floor(Date.now() / 1000) + 86400,
          perCallCap: "1000000000000000000",
          dailyCap: "10000000000000000000",
          rateLimitPerMin: 30,
          scopes: ["travel", "booking", "search"],
          services: ["gateway", "planner"],
        });
        seen.set(addr, result.txHash);
        setPassportStatuses((prev) => ({
          ...prev,
          [wallet.name]: { status: "done", txHash: result.txHash },
        }));
      } catch (err) {
        allDone = false;
        setPassportStatuses((prev) => ({
          ...prev,
          [wallet.name]: { status: "error", error: (err as Error).message },
        }));
      }
    }

    if (allDone) {
      updateStep(2, { completed: true, loading: false });
    } else {
      updateStep(2, { loading: false, error: "Some passports failed to deploy. Retry above." });
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Step 4: Create sessions                                          */
  /* ---------------------------------------------------------------- */

  const createSessions = async () => {
    updateStep(3, { loading: true, error: null });
    const wallets = agentWallets.filter((w) => w.address);
    let allDone = true;

    const seen = new Map<string, string>();
    for (const wallet of wallets) {
      const addr = wallet.address.toLowerCase();
      if (seen.has(addr)) {
        setSessionStatuses((prev) => ({
          ...prev,
          [wallet.name]: { status: "done", txHash: seen.get(addr) },
        }));
        continue;
      }

      setSessionStatuses((prev) => ({
        ...prev,
        [wallet.name]: { status: "pending" },
      }));
      try {
        const result = await grantSessionOnchain({
          agentAddress: wallet.address,
          sessionAddress: wallet.address,
          expiresAt: Math.floor(Date.now() / 1000) + 86400,
          scopes: ["travel", "booking", "search"],
        });
        seen.set(addr, result.txHash);
        setSessionStatuses((prev) => ({
          ...prev,
          [wallet.name]: { status: "done", txHash: result.txHash },
        }));
      } catch (err) {
        allDone = false;
        setSessionStatuses((prev) => ({
          ...prev,
          [wallet.name]: { status: "error", error: (err as Error).message },
        }));
      }
    }

    if (allDone) {
      updateStep(3, { completed: true, loading: false });
    } else {
      updateStep(3, { loading: false, error: "Some sessions failed. Retry above." });
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Step 5: Readiness check                                          */
  /* ---------------------------------------------------------------- */

  const checkReadiness = async () => {
    updateStep(4, { loading: true, error: null });
    const results: ServiceStatus[] = [];

    for (const svc of services) {
      const updated = { ...svc, checking: true };
      results.push(updated);
    }
    setServices(results);

    const finalResults: ServiceStatus[] = [];
    let allHealthy = true;

    for (const svc of services) {
      try {
        const response = await fetch(`${svc.url}/health`, {
          method: "GET",
          mode: "cors",
          signal: AbortSignal.timeout(20000),
        }).catch(() => null);

        const healthy = response !== null && response.ok;
        finalResults.push({ ...svc, healthy, checking: false });
        if (!healthy) allHealthy = false;
      } catch {
        finalResults.push({ ...svc, healthy: false, checking: false });
        allHealthy = false;
      }
    }

    setServices(finalResults);

    if (allHealthy) {
      updateStep(4, { completed: true, loading: false });
    } else {
      updateStep(4, { loading: false, error: "Some services are unreachable. Check them and retry." });
    }
  };

  useEffect(() => {
    if (currentStep === 4 && !steps[4].loading && !steps[4].completed && steps[3].completed) {
      checkReadiness();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  /* ---------------------------------------------------------------- */
  /*  Step 6: Launch console                                           */
  /* ---------------------------------------------------------------- */

  const launchConsole = () => {
    router.push("/console");
  };

  /* ---------------------------------------------------------------- */
  /*  Helper: update step state                                        */
  /* ---------------------------------------------------------------- */

  const updateStep = (index: number, patch: Partial<StepState>) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  /* ---------------------------------------------------------------- */
  /*  Render helpers                                                   */
  /* ---------------------------------------------------------------- */

  const renderStepIndicator = (index: number) => {
    const step = steps[index];
    const config = STEP_CONFIG[index];
    const isActive = index === currentStep;

    if (step.completed) {
      return (
        <motion.div
          initial={{ scale: 0, rotate: -90 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 15 }}
          style={{
            width: 38,
            height: 38,
            borderRadius: "50%",
            background: `linear-gradient(135deg, ${C.success}, #34d399)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            boxShadow: `0 0 16px rgba(34,197,94,0.35), 0 0 4px rgba(34,197,94,0.2)`,
          }}
        >
          <CheckCircle2 size={18} color="#fff" strokeWidth={2.5} />
        </motion.div>
      );
    }

    return (
      <motion.div
        animate={
          isActive
            ? {
                boxShadow: [
                  `0 0 8px 2px ${config.color}40`,
                  `0 0 20px 4px ${config.color}50`,
                  `0 0 8px 2px ${config.color}40`,
                ],
              }
            : {}
        }
        transition={isActive ? { duration: 2.5, repeat: Infinity, ease: "easeInOut" } : {}}
        style={{
          width: 38,
          height: 38,
          borderRadius: "50%",
          background: isActive
            ? `linear-gradient(135deg, ${config.color}25, ${config.color}10)`
            : "transparent",
          border: `2px solid ${isActive ? config.color : C.panelBorder}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          color: isActive ? config.color : C.textDim,
          fontSize: "0.82rem",
          fontWeight: 700,
          transition: "all 0.4s ease",
        }}
      >
        {index + 1}
      </motion.div>
    );
  };

  const renderStepContent = (index: number) => {
    const isActive = index === currentStep;
    const step = steps[index];

    if (!isActive && !step.completed) return null;
    if (step.completed && index !== currentStep) return null;

    switch (index) {
      case 0:
        return renderConnectWallet();
      case 1:
        return renderFundWallets();
      case 2:
        return renderDeployPassports();
      case 3:
        return renderCreateSessions();
      case 4:
        return renderReadinessCheck();
      case 5:
        return renderLaunchConsole();
      default:
        return null;
    }
  };

  /* ---------- Step 1 content ---------- */
  const renderConnectWallet = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {connectedAddress ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            background: C.successGlow,
            borderRadius: 10,
            border: `1px solid ${C.success}30`,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: C.success,
              boxShadow: `0 0 8px ${C.success}`,
            }}
          />
          <span style={{ fontFamily: "monospace", fontSize: "0.82rem", color: C.text }}>
            {connectedAddress}
          </span>
        </div>
      ) : (
        <GradientButton onClick={connectWallet} disabled={steps[0].loading} color="#3b82f6">
          {steps[0].loading ? (
            <>
              <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />
              Connecting...
            </>
          ) : (
            <>
              <Wallet size={15} />
              Connect MetaMask
            </>
          )}
        </GradientButton>
      )}
      {steps[0].error && <ErrorBanner message={steps[0].error} />}
    </div>
  );

  /* ---------- Step 2 content ---------- */
  const renderFundWallets = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {agentWallets.map((w) => (
          <div
            key={w.name}
            style={{
              padding: "12px 14px",
              background: C.cardBg,
              borderRadius: 10,
              borderLeft: `3px solid ${w.color}`,
              border: `1px solid ${C.panelBorder}`,
              borderLeftWidth: 3,
              borderLeftColor: w.color,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.78rem", color: C.textMuted }}>{w.name}</span>
              {parseFloat(w.balance) > 0 ? (
                <CheckCircle2 size={14} color={C.success} />
              ) : (
                <Loader2
                  size={14}
                  color={C.textDim}
                  style={{ animation: "spin 2s linear infinite" }}
                />
              )}
            </div>
            <div style={{ fontSize: "1.1rem", fontWeight: 700, color: C.text, marginTop: 4 }}>
              {w.balance}
            </div>
            <div
              style={{
                fontSize: "0.6rem",
                fontFamily: "monospace",
                color: C.textDimmer,
                marginTop: 3,
              }}
            >
              {w.address.slice(0, 10)}...{w.address.slice(-6)}
            </div>
          </div>
        ))}
      </div>

      <GradientButton
        onClick={() => window.open("https://faucet.gokite.ai/", "_blank")}
        color="#8b5cf6"
      >
        <ExternalLink size={15} />
        Open Kite Faucet
      </GradientButton>

      {agentWallets.length === 0 && (
        <div style={{ fontSize: "0.78rem", color: C.textDim, padding: "8px 0" }}>
          No agent wallet addresses configured in environment variables.
        </div>
      )}

      <div style={{ fontSize: "0.7rem", color: C.textDimmer }}>
        Balances refresh automatically every 8 seconds. Step completes when all wallets have {">"} 0 balance.
      </div>
    </div>
  );

  /* ---------- Step 3 content ---------- */
  const renderDeployPassports = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {agentWallets.map((w) => {
        const status = passportStatuses[w.name];
        return (
          <StatusRow key={w.name} name={w.name} color={w.color} status={status} />
        );
      })}

      <GradientButton onClick={deployPassports} disabled={steps[2].loading} color="#8b5cf6">
        {steps[2].loading ? (
          <>
            <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />
            Deploying Passports...
          </>
        ) : (
          <>
            <Shield size={15} />
            Deploy All Passports
          </>
        )}
      </GradientButton>
      {steps[2].error && <ErrorBanner message={steps[2].error} />}
    </div>
  );

  /* ---------- Step 4 content ---------- */
  const renderCreateSessions = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {agentWallets.map((w) => {
        const status = sessionStatuses[w.name];
        return (
          <StatusRow key={w.name} name={w.name} color={w.color} status={status} />
        );
      })}

      <GradientButton onClick={createSessions} disabled={steps[3].loading} color="#22c55e">
        {steps[3].loading ? (
          <>
            <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />
            Creating Sessions...
          </>
        ) : (
          <>
            <Key size={15} />
            Create All Sessions
          </>
        )}
      </GradientButton>
      {steps[3].error && <ErrorBanner message={steps[3].error} />}
    </div>
  );

  /* ---------- Step 5 content ---------- */
  const renderReadinessCheck = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {services.map((svc) => (
        <div
          key={svc.name}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 14px",
            background: C.cardBg,
            borderRadius: 10,
            border: `1px solid ${C.panelBorder}`,
          }}
        >
          <Activity size={14} color={C.textMuted} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "0.82rem", color: C.text, fontWeight: 500 }}>{svc.name}</div>
            <div style={{ fontSize: "0.65rem", fontFamily: "monospace", color: C.textDimmer }}>
              {svc.url}
            </div>
          </div>
          {svc.checking ? (
            <Loader2
              size={14}
              color={C.accent}
              style={{ animation: "spin 1s linear infinite" }}
            />
          ) : svc.healthy === true ? (
            <CheckCircle2 size={14} color={C.success} />
          ) : svc.healthy === false ? (
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: C.error,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.6rem",
                color: "#fff",
                fontWeight: 700,
              }}
            >
              !
            </div>
          ) : (
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: C.panelBorder,
              }}
            />
          )}
        </div>
      ))}

      <GradientButton onClick={checkReadiness} disabled={steps[4].loading} color="#0ea5e9">
        {steps[4].loading ? (
          <>
            <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />
            Checking Services...
          </>
        ) : (
          <>
            <Activity size={15} />
            Retry Health Checks
          </>
        )}
      </GradientButton>
      {steps[4].error && <ErrorBanner message={steps[4].error} />}
    </div>
  );

  /* ---------- Step 6 content ---------- */
  const renderLaunchConsole = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          padding: "18px",
          background: "linear-gradient(135deg, rgba(34,197,94,0.08), rgba(52,211,153,0.04))",
          borderRadius: 12,
          border: `1px solid ${C.success}25`,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "0.95rem", color: C.success, fontWeight: 600 }}>
          All systems are go!
        </div>
        <div style={{ fontSize: "0.78rem", color: C.textMuted, marginTop: 6 }}>
          Wallet connected, agents funded, passports deployed, sessions created, services online.
        </div>
      </motion.div>

      <motion.button
        onClick={launchConsole}
        whileHover={{ scale: 1.02, y: -1 }}
        whileTap={{ scale: 0.98 }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          padding: "16px 28px",
          borderRadius: 12,
          border: "none",
          background: "linear-gradient(135deg, #3b82f6, #8b5cf6, #c084fc)",
          backgroundSize: "200% 200%",
          animation: "gradient-shift 4s ease-in-out infinite",
          color: "#fff",
          fontWeight: 700,
          fontSize: "0.95rem",
          cursor: "pointer",
          fontFamily: "inherit",
          boxShadow:
            "0 4px 20px rgba(59,130,246,0.3), 0 0 40px rgba(139,92,246,0.15), inset 0 1px 0 rgba(255,255,255,0.15)",
        }}
      >
        <Rocket size={18} />
        Launch TripDesk Console
        <ArrowRight size={16} />
      </motion.button>
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  Main render                                                      */
  /* ---------------------------------------------------------------- */

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 700,
        margin: "0 auto",
      }}
    >
      {/* Progress bar with glow */}
      <div
        style={{
          width: "100%",
          height: 4,
          background: C.panelBorder,
          borderRadius: 4,
          overflow: "hidden",
          marginBottom: 28,
          position: "relative",
        }}
      >
        <motion.div
          animate={{ width: `${progressPercent}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          style={{
            height: "100%",
            background: allComplete
              ? `linear-gradient(90deg, ${C.success}, #34d399)`
              : `linear-gradient(90deg, ${C.accent}, #818cf8, #c084fc)`,
            backgroundSize: "200% 100%",
            animation: allComplete ? "none" : "gradient-shift 3s ease-in-out infinite",
            borderRadius: 4,
            position: "relative",
          }}
        />
        {/* Glow beneath progress bar */}
        {progressPercent > 0 && (
          <motion.div
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            style={{
              position: "absolute",
              top: 2,
              left: 0,
              height: 8,
              background: allComplete
                ? `linear-gradient(90deg, ${C.success}40, #34d39940)`
                : `linear-gradient(90deg, ${C.accent}40, #818cf840)`,
              filter: "blur(6px)",
              borderRadius: 4,
              pointerEvents: "none",
            }}
          />
        )}
      </div>

      {/* Progress label */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <span style={{ fontSize: "0.78rem", color: C.textDim }}>
          {completedCount} of {steps.length} steps complete
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {allComplete && (
            <motion.span
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              style={{
                fontSize: "0.75rem",
                color: C.success,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <CheckCircle2 size={13} />
              Ready
            </motion.span>
          )}
          {!allComplete && (
            <button
              onClick={() => router.push("/console")}
              style={{
                padding: "5px 14px",
                borderRadius: 8,
                border: `1px solid ${C.panelBorder}`,
                background: "rgba(255,255,255,0.03)",
                color: C.textDim,
                fontSize: "0.72rem",
                cursor: "pointer",
                fontFamily: "inherit",
                backdropFilter: "blur(8px)",
                transition: "all 0.2s ease",
              }}
            >
              Skip to Console &rarr;
            </button>
          )}
        </div>
      </div>

      {/* Steps */}
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {STEP_CONFIG.map((config, index) => {
          const isActive = index === currentStep;
          const step = steps[index];
          const StepIcon = config.icon;

          return (
            <div key={index}>
              {/* Connector line above (except first) */}
              {index > 0 && (
                <div style={{ position: "relative", marginLeft: 18 }}>
                  <div
                    style={{
                      width: 2,
                      height: 20,
                      background: C.panelBorder,
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    <motion.div
                      initial={{ height: "0%" }}
                      animate={{ height: steps[index - 1].completed ? "100%" : "0%" }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                      style={{
                        width: "100%",
                        background: `linear-gradient(180deg, ${C.success}, ${config.color})`,
                        borderRadius: 1,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Step card */}
              <motion.div
                layout
                style={{
                  background: isActive ? C.panelGlass : "transparent",
                  backdropFilter: isActive ? "blur(16px) saturate(150%)" : "none",
                  border: isActive
                    ? `1px solid ${config.color}35`
                    : "1px solid transparent",
                  borderRadius: 14,
                  padding: isActive ? "18px 20px" : "10px 20px",
                  transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {/* Subtle inner gradient for active */}
                {isActive && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: 14,
                      background: `radial-gradient(ellipse at 20% 30%, ${config.color}08, transparent 60%)`,
                      pointerEvents: "none",
                    }}
                  />
                )}

                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", gap: 14, position: "relative" }}>
                  {renderStepIndicator(index)}
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: "0.9rem",
                        fontWeight: 600,
                        color: isActive
                          ? C.text
                          : step.completed
                            ? C.success
                            : C.textDim,
                      }}
                    >
                      <StepIcon
                        size={16}
                        color={
                          isActive
                            ? config.color
                            : step.completed
                              ? C.success
                              : C.textDim
                        }
                      />
                      {config.title}
                    </div>
                    {isActive && (
                      <div style={{ fontSize: "0.78rem", color: C.textDim, marginTop: 4, lineHeight: 1.5 }}>
                        {config.description}
                      </div>
                    )}
                  </div>
                </div>

                {/* Expanded content */}
                <AnimatePresence mode="wait">
                  {isActive && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      style={{ marginTop: 18, overflow: "hidden", position: "relative" }}
                    >
                      {renderStepContent(index)}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared sub-components                                              */
/* ------------------------------------------------------------------ */

function ErrorBanner({ message }: { message: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        fontSize: "0.78rem",
        color: C.error,
        background: C.errorGlow,
        padding: "10px 14px",
        borderRadius: 10,
        border: `1px solid ${C.error}25`,
        backdropFilter: "blur(8px)",
      }}
    >
      {message}
    </motion.div>
  );
}

function GradientButton({
  onClick,
  disabled,
  color,
  children,
}: {
  onClick?: () => void;
  disabled?: boolean;
  color: string;
  children: React.ReactNode;
}) {
  // Create a lighter shade for gradient
  const lightColor = color + "cc";

  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? {} : { scale: 1.015, y: -1 }}
      whileTap={disabled ? {} : { scale: 0.985 }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "12px 22px",
        borderRadius: 10,
        border: "none",
        background: `linear-gradient(135deg, ${color}, ${lightColor})`,
        color: "#fff",
        fontWeight: 600,
        fontSize: "0.85rem",
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "inherit",
        opacity: disabled ? 0.6 : 1,
        boxShadow: `0 4px 16px ${color}30, inset 0 1px 0 rgba(255,255,255,0.12)`,
        transition: "opacity 0.2s ease, box-shadow 0.2s ease",
      }}
    >
      {children}
    </motion.button>
  );
}

function StatusRow({
  name,
  color,
  status,
}: {
  name: string;
  color: string;
  status?: { status: string; txHash?: string; error?: string };
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 14px",
        background: C.cardBg,
        borderRadius: 10,
        border: `1px solid ${C.panelBorder}`,
        borderLeft: `3px solid ${color}`,
      }}
    >
      <span style={{ flex: 1, fontSize: "0.82rem", color: C.text, fontWeight: 500 }}>{name}</span>
      {!status || status.status === "idle" ? (
        <span style={{ fontSize: "0.72rem", color: C.textDimmer }}>Waiting</span>
      ) : status.status === "pending" ? (
        <Loader2
          size={14}
          color={C.accent}
          style={{ animation: "spin 1s linear infinite" }}
        />
      ) : status.status === "done" ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <CheckCircle2 size={14} color={C.success} />
          <span style={{ fontSize: "0.65rem", fontFamily: "monospace", color: C.textDim }}>
            {status.txHash?.slice(0, 10)}...
          </span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
          <span style={{ fontSize: "0.72rem", color: C.error, fontWeight: 600 }}>Failed</span>
          {status.error && (
            <span style={{ fontSize: "0.6rem", color: C.textDimmer, maxWidth: 220, textAlign: "right" }}>
              {status.error.length > 80 ? status.error.slice(0, 80) + "..." : status.error}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
