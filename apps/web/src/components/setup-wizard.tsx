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
  { name: "Planner", envKey: "NEXT_PUBLIC_PLANNER_ADDRESS", color: "#3b82f6" },
  { name: "Rider", envKey: "NEXT_PUBLIC_RIDER_ADDRESS", color: "#22d3ee" },
  { name: "Foodie", envKey: "NEXT_PUBLIC_FOODIE_ADDRESS", color: "#f59e0b" },
  { name: "EventBot", envKey: "NEXT_PUBLIC_EVENTBOT_ADDRESS", color: "#ef4444" },
];

function getAgentAddress(envKey: string): string {
  const envMap: Record<string, string | undefined> = {
    NEXT_PUBLIC_PLANNER_ADDRESS: process.env.NEXT_PUBLIC_PLANNER_ADDRESS,
    NEXT_PUBLIC_RIDER_ADDRESS: process.env.NEXT_PUBLIC_RIDER_ADDRESS,
    NEXT_PUBLIC_FOODIE_ADDRESS: process.env.NEXT_PUBLIC_FOODIE_ADDRESS,
    NEXT_PUBLIC_EVENTBOT_ADDRESS: process.env.NEXT_PUBLIC_EVENTBOT_ADDRESS,
  };
  return envMap[envKey] || "";
}

/* ------------------------------------------------------------------ */
/*  Style constants                                                    */
/* ------------------------------------------------------------------ */

const COLORS = {
  bg: "#0a0a0f",
  panel: "#111827",
  panelHover: "#1a2332",
  border: "#1e293b",
  borderActive: "#3b82f6",
  text: "#e2e8f0",
  textMuted: "#94a3b8",
  textDim: "#64748b",
  textDimmer: "#475569",
  accent: "#3b82f6",
  accentGlow: "rgba(59, 130, 246, 0.15)",
  success: "#22c55e",
  successGlow: "rgba(34, 197, 94, 0.15)",
  error: "#ef4444",
  errorGlow: "rgba(239, 68, 68, 0.1)",
  cardBg: "#0f172a",
};

/* ------------------------------------------------------------------ */
/*  Step configuration                                                 */
/* ------------------------------------------------------------------ */

const STEP_CONFIG = [
  {
    title: "Connect Wallet",
    description: "Connect your MetaMask or injected wallet to get started.",
    icon: Wallet,
  },
  {
    title: "Fund Wallets",
    description: "Fund each agent wallet using the Kite faucet so they can transact on-chain.",
    icon: Coins,
  },
  {
    title: "Deploy Passports",
    description: "Deploy an on-chain passport for each agent to authorize their actions.",
    icon: Shield,
  },
  {
    title: "Create Sessions",
    description: "Grant session keys so agents can act within their authorized scopes.",
    icon: Key,
  },
  {
    title: "Readiness Check",
    description: "Verify that the gateway and planner services are online and responding.",
    icon: Activity,
  },
  {
    title: "Launch Console",
    description: "Everything is set up. Launch the TripDesk multi-agent console.",
    icon: Rocket,
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
      name: "Gateway",
      url: process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:4001",
      healthy: null,
      checking: false,
    },
    {
      name: "Planner",
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

  // Start polling when step 2 is active
  useEffect(() => {
    if (currentStep === 1 && !fundingPolling) {
      setFundingPolling(true);
      fetchBalances();
    }
  }, [currentStep, fundingPolling, fetchBalances]);

  // Poll balances every 8 seconds when on step 2
  useEffect(() => {
    if (!fundingPolling) return;
    const interval = setInterval(fetchBalances, 8000);
    return () => clearInterval(interval);
  }, [fundingPolling, fetchBalances]);

  // Also fetch once when wallet connects (entering step 2 range)
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

    // Deduplicate addresses — if agents share a wallet, only deploy once
    const seen = new Map<string, string>(); // address -> txHash from first deploy
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
          expiresAt: Math.floor(Date.now() / 1000) + 86400, // 24 hours
          perCallCap: "1000000000000000000", // 1 token
          dailyCap: "10000000000000000000", // 10 tokens
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

    // Deduplicate addresses — if agents share a wallet, only grant once
    const seen = new Map<string, string>(); // address -> txHash from first grant
    for (const wallet of wallets) {
      const addr = wallet.address.toLowerCase();
      if (seen.has(addr)) {
        // Reuse the result from the first grant with this address
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
          sessionAddress: wallet.address, // session key = agent key for demo
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
        // Render free tier can cold-start in 10-15s, so use a generous timeout
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

  // Auto-run readiness check when reaching step 5
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
    if (step.completed) {
      return (
        <motion.div
          initial={{ scale: 0, rotate: -90 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 15 }}
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: COLORS.successGlow,
            border: `2px solid ${COLORS.success}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <CheckCircle2 size={16} color={COLORS.success} />
        </motion.div>
      );
    }

    const isActive = index === currentStep;
    return (
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: isActive ? COLORS.accentGlow : "transparent",
          border: `2px solid ${isActive ? COLORS.accent : COLORS.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          color: isActive ? COLORS.accent : COLORS.textDim,
          fontSize: "0.8rem",
          fontWeight: 600,
          transition: "all 0.3s ease",
        }}
      >
        {index + 1}
      </div>
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
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: COLORS.success,
              boxShadow: `0 0 8px ${COLORS.success}`,
            }}
          />
          <span style={{ fontFamily: "monospace", fontSize: "0.82rem", color: COLORS.text }}>
            {connectedAddress}
          </span>
        </div>
      ) : (
        <button onClick={connectWallet} disabled={steps[0].loading} style={primaryButtonStyle}>
          {steps[0].loading ? (
            <>
              <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
              Connecting...
            </>
          ) : (
            <>
              <Wallet size={14} />
              Connect MetaMask
            </>
          )}
        </button>
      )}
      {steps[0].error && <ErrorBanner message={steps[0].error} />}
    </div>
  );

  /* ---------- Step 2 content ---------- */
  const renderFundWallets = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {agentWallets.map((w) => (
          <div
            key={w.name}
            style={{
              padding: "10px 12px",
              background: COLORS.cardBg,
              borderRadius: 8,
              borderLeft: `3px solid ${w.color}`,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.78rem", color: COLORS.textMuted }}>{w.name}</span>
              {parseFloat(w.balance) > 0 ? (
                <CheckCircle2 size={14} color={COLORS.success} />
              ) : (
                <Loader2
                  size={14}
                  color={COLORS.textDim}
                  style={{ animation: "spin 2s linear infinite" }}
                />
              )}
            </div>
            <div style={{ fontSize: "1rem", fontWeight: 700, color: COLORS.text, marginTop: 2 }}>
              {w.balance}
            </div>
            <div
              style={{
                fontSize: "0.6rem",
                fontFamily: "monospace",
                color: COLORS.textDimmer,
                marginTop: 2,
              }}
            >
              {w.address.slice(0, 10)}...{w.address.slice(-6)}
            </div>
          </div>
        ))}
      </div>

      <a
        href="https://faucet.gokite.ai/"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          ...primaryButtonStyle,
          textDecoration: "none",
          textAlign: "center" as const,
          background: "#8b5cf6",
        }}
      >
        <ExternalLink size={14} />
        Open Kite Faucet
      </a>

      {agentWallets.length === 0 && (
        <div style={{ fontSize: "0.78rem", color: COLORS.textDim, padding: "8px 0" }}>
          No agent wallet addresses configured in environment variables.
        </div>
      )}

      <div style={{ fontSize: "0.7rem", color: COLORS.textDim }}>
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
          <div
            key={w.name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 12px",
              background: COLORS.cardBg,
              borderRadius: 8,
              borderLeft: `3px solid ${w.color}`,
            }}
          >
            <span style={{ flex: 1, fontSize: "0.8rem", color: COLORS.text }}>{w.name}</span>
            {!status || status.status === "idle" ? (
              <span style={{ fontSize: "0.72rem", color: COLORS.textDim }}>Waiting</span>
            ) : status.status === "pending" ? (
              <Loader2
                size={14}
                color={COLORS.accent}
                style={{ animation: "spin 1s linear infinite" }}
              />
            ) : status.status === "done" ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <CheckCircle2 size={14} color={COLORS.success} />
                <span style={{ fontSize: "0.65rem", fontFamily: "monospace", color: COLORS.textDim }}>
                  {status.txHash?.slice(0, 10)}...
                </span>
              </div>
            ) : (
              <span style={{ fontSize: "0.72rem", color: COLORS.error }}>
                Failed
              </span>
            )}
          </div>
        );
      })}

      <button
        onClick={deployPassports}
        disabled={steps[2].loading}
        style={primaryButtonStyle}
      >
        {steps[2].loading ? (
          <>
            <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
            Deploying Passports...
          </>
        ) : (
          <>
            <Shield size={14} />
            Deploy All Passports
          </>
        )}
      </button>
      {steps[2].error && <ErrorBanner message={steps[2].error} />}
    </div>
  );

  /* ---------- Step 4 content ---------- */
  const renderCreateSessions = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {agentWallets.map((w) => {
        const status = sessionStatuses[w.name];
        return (
          <div
            key={w.name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 12px",
              background: COLORS.cardBg,
              borderRadius: 8,
              borderLeft: `3px solid ${w.color}`,
            }}
          >
            <span style={{ flex: 1, fontSize: "0.8rem", color: COLORS.text }}>{w.name}</span>
            {!status || status.status === "idle" ? (
              <span style={{ fontSize: "0.72rem", color: COLORS.textDim }}>Waiting</span>
            ) : status.status === "pending" ? (
              <Loader2
                size={14}
                color={COLORS.accent}
                style={{ animation: "spin 1s linear infinite" }}
              />
            ) : status.status === "done" ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <CheckCircle2 size={14} color={COLORS.success} />
                <span style={{ fontSize: "0.65rem", fontFamily: "monospace", color: COLORS.textDim }}>
                  {status.txHash?.slice(0, 10)}...
                </span>
              </div>
            ) : (
              <span style={{ fontSize: "0.72rem", color: COLORS.error }}>
                Failed
              </span>
            )}
          </div>
        );
      })}

      <button
        onClick={createSessions}
        disabled={steps[3].loading}
        style={primaryButtonStyle}
      >
        {steps[3].loading ? (
          <>
            <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
            Creating Sessions...
          </>
        ) : (
          <>
            <Key size={14} />
            Create All Sessions
          </>
        )}
      </button>
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
            padding: "10px 12px",
            background: COLORS.cardBg,
            borderRadius: 8,
          }}
        >
          <Activity size={14} color={COLORS.textMuted} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "0.8rem", color: COLORS.text }}>{svc.name}</div>
            <div style={{ fontSize: "0.65rem", fontFamily: "monospace", color: COLORS.textDimmer }}>
              {svc.url}
            </div>
          </div>
          {svc.checking ? (
            <Loader2
              size={14}
              color={COLORS.accent}
              style={{ animation: "spin 1s linear infinite" }}
            />
          ) : svc.healthy === true ? (
            <CheckCircle2 size={14} color={COLORS.success} />
          ) : svc.healthy === false ? (
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: COLORS.error,
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
                background: COLORS.border,
              }}
            />
          )}
        </div>
      ))}

      <button
        onClick={checkReadiness}
        disabled={steps[4].loading}
        style={{ ...primaryButtonStyle, background: "#0ea5e9" }}
      >
        {steps[4].loading ? (
          <>
            <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
            Checking Services...
          </>
        ) : (
          <>
            <Activity size={14} />
            Retry Health Checks
          </>
        )}
      </button>
      {steps[4].error && <ErrorBanner message={steps[4].error} />}
    </div>
  );

  /* ---------- Step 6 content ---------- */
  const renderLaunchConsole = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          padding: "16px",
          background: COLORS.successGlow,
          borderRadius: 8,
          border: `1px solid ${COLORS.success}33`,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "0.9rem", color: COLORS.success, fontWeight: 600 }}>
          All systems are go!
        </div>
        <div style={{ fontSize: "0.75rem", color: COLORS.textMuted, marginTop: 4 }}>
          Wallet connected, agents funded, passports deployed, sessions created, services online.
        </div>
      </motion.div>

      <motion.button
        onClick={launchConsole}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        style={{
          ...primaryButtonStyle,
          background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
          fontSize: "0.9rem",
          padding: "14px 24px",
        }}
      >
        <Rocket size={16} />
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
        maxWidth: 640,
        margin: "0 auto",
      }}
    >
      {/* CSS for spin animation */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Progress bar */}
      <div
        style={{
          width: "100%",
          height: 4,
          background: COLORS.border,
          borderRadius: 4,
          overflow: "hidden",
          marginBottom: 24,
        }}
      >
        <motion.div
          animate={{ width: `${progressPercent}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          style={{
            height: "100%",
            background: allComplete
              ? `linear-gradient(90deg, ${COLORS.success}, #34d399)`
              : `linear-gradient(90deg, ${COLORS.accent}, #818cf8)`,
            borderRadius: 4,
          }}
        />
      </div>

      {/* Progress label */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <span style={{ fontSize: "0.78rem", color: COLORS.textDim }}>
          {completedCount} of {steps.length} steps complete
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {allComplete && (
            <motion.span
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              style={{
                fontSize: "0.72rem",
                color: COLORS.success,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <CheckCircle2 size={12} />
              Ready
            </motion.span>
          )}
          {!allComplete && (
            <button
              onClick={() => router.push("/console")}
              style={{
                padding: "4px 12px",
                borderRadius: 6,
                border: `1px solid ${COLORS.border}`,
                background: "transparent",
                color: COLORS.textDim,
                fontSize: "0.7rem",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Skip to Console →
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
                <div
                  style={{
                    width: 2,
                    height: 16,
                    background: steps[index - 1].completed ? COLORS.success : COLORS.border,
                    marginLeft: 15,
                    transition: "background 0.3s ease",
                  }}
                />
              )}

              {/* Step row */}
              <motion.div
                layout
                style={{
                  background: isActive ? COLORS.panel : "transparent",
                  border: `1px solid ${isActive ? COLORS.borderActive : "transparent"}`,
                  borderRadius: 12,
                  padding: isActive ? "16px" : "8px 16px",
                  transition: "all 0.3s ease",
                }}
              >
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {renderStepIndicator(index)}
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: "0.88rem",
                        fontWeight: 600,
                        color: isActive
                          ? COLORS.text
                          : step.completed
                          ? COLORS.success
                          : COLORS.textDim,
                      }}
                    >
                      <StepIcon
                        size={15}
                        color={
                          isActive
                            ? COLORS.accent
                            : step.completed
                            ? COLORS.success
                            : COLORS.textDim
                        }
                      />
                      {config.title}
                    </div>
                    {isActive && (
                      <div style={{ fontSize: "0.75rem", color: COLORS.textDim, marginTop: 2 }}>
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
                      style={{ marginTop: 16, overflow: "hidden" }}
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
/*  Shared sub-components and styles                                   */
/* ------------------------------------------------------------------ */

function ErrorBanner({ message }: { message: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        fontSize: "0.75rem",
        color: COLORS.error,
        background: COLORS.errorGlow,
        padding: "8px 12px",
        borderRadius: 6,
        border: `1px solid ${COLORS.error}33`,
      }}
    >
      {message}
    </motion.div>
  );
}

const primaryButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "10px 20px",
  borderRadius: 8,
  border: "none",
  background: COLORS.accent,
  color: "#fff",
  fontWeight: 600,
  fontSize: "0.82rem",
  cursor: "pointer",
  fontFamily: "inherit",
  transition: "opacity 0.2s ease",
};
