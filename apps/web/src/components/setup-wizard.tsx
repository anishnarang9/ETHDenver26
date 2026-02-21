"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { BrowserProvider, type Eip1193Provider } from "ethers";
import { CheckCircle2, Loader2, Wallet, ArrowRight, Zap } from "lucide-react";
import { getTokenBalance } from "../lib/kite-rpc";
import { grantSessionOnchain, upsertPassportOnchain } from "../lib/onchain";
import { setSetupComplete } from "../lib/setup-state";

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
}

const AGENT_WALLET_SOURCES = [{ name: "Planner", envKey: "NEXT_PUBLIC_PLANNER_ADDRESS", color: "#5e8bff" }] as const;

const SCOPE_PRESET = ["travel", "booking", "search"];
const SERVICE_PRESET = ["gateway", "planner"];

const STEP_META = [
  { title: "Connect Owner Wallet", copy: "Authorize in-browser signing for on-chain passport and session writes." },
  { title: "Fund Agent Wallets", copy: "All configured wallets need non-zero balance to run paid actions." },
  { title: "Deploy Passports", copy: "Write policy envelopes for each agent with scopes, services, and caps." },
  { title: "Grant Sessions", copy: "Delegate short-lived session keys to activate operational access." },
  { title: "Readiness Check", copy: "Verify planner and gateway are healthy before launch." },
  { title: "Proceed to Dashboard", copy: "Finish setup and enter the live operations surface." },
] as const;

function readAddress(envKey: string): string {
  const map: Record<string, string | undefined> = {
    NEXT_PUBLIC_PLANNER_ADDRESS: process.env.NEXT_PUBLIC_PLANNER_ADDRESS,
  };
  return map[envKey] || "";
}

export function SetupWizard() {
  const router = useRouter();
  const [ownerAddress, setOwnerAddress] = useState("");
  const [wallets, setWallets] = useState<AgentWallet[]>([]);
  const [passportStatus, setPassportStatus] = useState<Record<string, string>>({});
  const [sessionStatus, setSessionStatus] = useState<Record<string, string>>({});
  const [steps, setSteps] = useState<StepState[]>(
    STEP_META.map(() => ({ completed: false, loading: false, error: null }))
  );
  const [services, setServices] = useState<ServiceStatus[]>([
    {
      name: "Planner",
      url: process.env.NEXT_PUBLIC_PLANNER_URL || "http://localhost:4005",
      healthy: null,
    },
    {
      name: "Gateway",
      url: process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:4001",
      healthy: null,
    },
  ]);
  const [currentStep, setCurrentStep] = useState(0);
  const [readinessAutoTriggered, setReadinessAutoTriggered] = useState(false);

  const operationalComplete = useMemo(() => steps.slice(0, 5).every((step) => step.completed), [steps]);
  const progressPct = useMemo(() => ((Math.min(currentStep, 5) + 1) / STEP_META.length) * 100, [currentStep]);

  const patchStep = (index: number, patch: Partial<StepState>) => {
    setSteps((prev) => prev.map((step, idx) => (idx === index ? { ...step, ...patch } : step)));
  };

  const advance = () => setCurrentStep((prev) => Math.min(prev + 1, STEP_META.length - 1));

  const connectWallet = async () => {
    patchStep(0, { loading: true, error: null });
    try {
      const runtime = globalThis as unknown as {
        ethereum?: Eip1193Provider;
        window?: {
          ethereum?: Eip1193Provider & {
            providers?: Array<Eip1193Provider & { isMetaMask?: boolean }>;
            isMetaMask?: boolean;
          };
        };
      };
      const ethereum = runtime.window?.ethereum ?? runtime.ethereum;
      if (!ethereum) {
        throw new Error("No EVM wallet found. Install or unlock MetaMask.");
      }
      const preferredProvider =
        (runtime.window?.ethereum as (Eip1193Provider & { providers?: Array<Eip1193Provider & { isMetaMask?: boolean }> }) | undefined)
          ?.providers?.find((provider) => provider.isMetaMask) || ethereum;
      const provider = new BrowserProvider(preferredProvider);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      setOwnerAddress(address);
      patchStep(0, { loading: false, completed: true });
      setCurrentStep(1);
    } catch (error) {
      patchStep(0, { loading: false, error: (error as Error).message });
    }
  };

  const fetchBalances = useCallback(async () => {
    const next: AgentWallet[] = [];
    for (const source of AGENT_WALLET_SOURCES) {
      const address = readAddress(source.envKey);
      if (!address) {
        continue;
      }
      const balance = await getTokenBalance(address).catch(() => "0.0000");
      next.push({ name: source.name, address, color: source.color, balance });
    }

    // Fallback: if no env-backed agent wallets are configured, use the connected owner wallet.
    if (next.length === 0 && ownerAddress) {
      const balance = await getTokenBalance(ownerAddress).catch(() => "0.0000");
      next.push({
        name: "Connected Wallet",
        address: ownerAddress,
        color: "#5e8bff",
        balance,
      });
    }

    setWallets(next);

    if (next.length > 0 && next.every((wallet) => Number(wallet.balance) > 0)) {
      patchStep(1, { completed: true, loading: false, error: null });
    }
  }, [ownerAddress]);

  useEffect(() => {
    if (currentStep < 1 || steps[1]?.completed) {
      return;
    }
    void fetchBalances();
    const interval = setInterval(() => {
      void fetchBalances();
    }, 7000);
    return () => clearInterval(interval);
  }, [currentStep, fetchBalances, steps]);

  const deployPassports = async () => {
    if (!ownerAddress) {
      patchStep(2, { error: "Connect owner wallet first." });
      return;
    }
    patchStep(2, { loading: true, error: null });
    let hasError = false;
    const seen = new Set<string>();

    for (const wallet of wallets) {
      if (seen.has(wallet.address.toLowerCase())) {
        setPassportStatus((prev) => ({ ...prev, [wallet.name]: "shared" }));
        continue;
      }

      seen.add(wallet.address.toLowerCase());
      setPassportStatus((prev) => ({ ...prev, [wallet.name]: "pending" }));
      try {
        const tx = await upsertPassportOnchain({
          agentAddress: wallet.address,
          expiresAt: Math.floor(Date.now() / 1000) + 86400 * 30,
          perCallCap: "1000000000000000000",
          dailyCap: "10000000000000000000",
          rateLimitPerMin: 30,
          scopes: SCOPE_PRESET,
          services: SERVICE_PRESET,
        });
        setPassportStatus((prev) => ({ ...prev, [wallet.name]: tx.txHash.slice(0, 12) }));
      } catch (error) {
        hasError = true;
        setPassportStatus((prev) => ({ ...prev, [wallet.name]: `error:${(error as Error).message}` }));
      }
    }

    patchStep(2, {
      loading: false,
      completed: !hasError,
      error: hasError ? "One or more passport writes failed." : null,
    });

    if (!hasError) {
      setCurrentStep(3);
    }
  };

  const grantSessions = async () => {
    if (!ownerAddress) {
      patchStep(3, { error: "Connect owner wallet first." });
      return;
    }
    patchStep(3, { loading: true, error: null });
    let hasError = false;
    const seen = new Set<string>();

    for (const wallet of wallets) {
      if (seen.has(wallet.address.toLowerCase())) {
        setSessionStatus((prev) => ({ ...prev, [wallet.name]: "shared" }));
        continue;
      }
      seen.add(wallet.address.toLowerCase());
      setSessionStatus((prev) => ({ ...prev, [wallet.name]: "pending" }));
      try {
        const tx = await grantSessionOnchain({
          agentAddress: wallet.address,
          sessionAddress: wallet.address,
          expiresAt: Math.floor(Date.now() / 1000) + 86400 * 30,
          scopes: SCOPE_PRESET,
        });
        setSessionStatus((prev) => ({ ...prev, [wallet.name]: tx.txHash.slice(0, 12) }));
      } catch (error) {
        hasError = true;
        setSessionStatus((prev) => ({ ...prev, [wallet.name]: `error:${(error as Error).message}` }));
      }
    }

    patchStep(3, {
      loading: false,
      completed: !hasError,
      error: hasError ? "Session grant failed for at least one wallet." : null,
    });

    if (!hasError) {
      setCurrentStep(4);
    }
  };

  const checkReadiness = async () => {
    patchStep(4, { loading: true, error: null });
    const next: ServiceStatus[] = [];
    let plannerHealthy = false;

    for (const service of services) {
      try {
        const response = await fetch(`${service.url}/health`, {
          method: "GET",
          mode: "cors",
          signal: AbortSignal.timeout(15000),
        });
        next.push({ ...service, healthy: response.ok });
        if (service.name.toLowerCase() === "planner") {
          plannerHealthy = response.ok;
        }
      } catch {
        next.push({ ...service, healthy: false });
        if (service.name.toLowerCase() === "planner") {
          plannerHealthy = false;
        }
      }
    }

    setServices(next);
    patchStep(4, {
      loading: false,
      completed: plannerHealthy,
      error: plannerHealthy ? null : "Planner health check failed.",
    });

    if (plannerHealthy) {
      setCurrentStep(5);
    }
  };

  useEffect(() => {
    if (currentStep !== 4 || readinessAutoTriggered || steps[4]?.loading || steps[4]?.completed) {
      return;
    }
    setReadinessAutoTriggered(true);
    void checkReadiness();
  }, [currentStep, readinessAutoTriggered, steps]);

  useEffect(() => {
    if (currentStep !== 4) {
      setReadinessAutoTriggered(false);
    }
  }, [currentStep]);

  const proceedToDashboard = () => {
    if (!operationalComplete) {
      patchStep(5, { error: "Complete setup checks or use escape dashboard to bypass." });
      return;
    }
    setSetupComplete(true);
    patchStep(5, { completed: true, error: null });
    router.push("/console");
  };

  const escapeNextStep = () => {
    patchStep(currentStep, { completed: true, loading: false, error: null });
    advance();
  };

  const escapeDashboard = () => {
    setSetupComplete(true);
    setSteps((prev) => prev.map((step, index) => (index <= 5 ? { ...step, completed: true, error: null } : step)));
    router.push("/console");
  };

  const content = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="setup-step-content">
            <button className="landing-try-button" onClick={connectWallet} disabled={steps[0].loading}>
              {steps[0].loading ? <Loader2 size={16} className="spin" /> : <Wallet size={16} />} Connect Wallet
            </button>
            <div className="setup-inline-note mono">{ownerAddress || "no wallet connected"}</div>
          </div>
        );
      case 1:
        return (
          <div className="setup-step-content">
            <div className="feed-list" style={{ maxHeight: 260 }}>
              {wallets.length === 0 && <div className="feed-item">No agent wallet env vars configured.</div>}
              {wallets.map((wallet) => (
                <div key={wallet.name} className="feed-item">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <strong>{wallet.name}</strong>
                    <span className="mono">{wallet.balance}</span>
                  </div>
                  <div className="mono" style={{ marginTop: 4, color: "var(--text-2)", fontSize: 11 }}>
                    {wallet.address}
                  </div>
                </div>
              ))}
            </div>
            <div className="inline-actions">
              <button className="secondary-button" onClick={() => void fetchBalances()}>
                Refresh Balances
              </button>
              <a className="secondary-button" href="https://faucet.gokite.ai" target="_blank" rel="noreferrer">
                Open Faucet
              </a>
              {steps[1]?.completed && (
                <button className="primary-button" onClick={() => setCurrentStep(2)}>
                  Continue <ArrowRight size={14} />
                </button>
              )}
            </div>
          </div>
        );
      case 2:
        return (
          <div className="setup-step-content">
            <button
              className="landing-try-button"
              onClick={deployPassports}
              disabled={steps[2].loading || wallets.length === 0 || !ownerAddress}
            >
              {steps[2].loading ? <Loader2 size={16} className="spin" /> : <Zap size={16} />} Deploy Passports
            </button>
            <div className="feed-list" style={{ maxHeight: 220 }}>
              {wallets.map((wallet) => (
                <div key={wallet.name} className="feed-item">
                  <strong>{wallet.name}</strong>
                  <div className="mono" style={{ marginTop: 4, fontSize: 11, color: "var(--text-2)" }}>
                    {passportStatus[wallet.name] || "idle"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      case 3:
        return (
          <div className="setup-step-content">
            <button
              className="landing-try-button"
              onClick={grantSessions}
              disabled={steps[3].loading || wallets.length === 0 || !ownerAddress}
            >
              {steps[3].loading ? <Loader2 size={16} className="spin" /> : <Zap size={16} />} Grant Sessions
            </button>
            <div className="feed-list" style={{ maxHeight: 220 }}>
              {wallets.map((wallet) => (
                <div key={wallet.name} className="feed-item">
                  <strong>{wallet.name}</strong>
                  <div className="mono" style={{ marginTop: 4, fontSize: 11, color: "var(--text-2)" }}>
                    {sessionStatus[wallet.name] || "idle"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      case 4:
        return (
          <div className="setup-step-content">
            <button className="landing-try-button" onClick={checkReadiness} disabled={steps[4].loading}>
              {steps[4].loading ? <Loader2 size={16} className="spin" /> : <CheckCircle2 size={16} />} Check Services
            </button>
            <div className="feed-list" style={{ maxHeight: 220 }}>
              {services.map((service) => (
                <div key={service.name} className="feed-item">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <strong>{service.name}</strong>
                    <span className={`badge ${service.healthy ? "ok" : "danger"}`}>
                      {service.healthy ? "healthy" : "unreachable"}
                    </span>
                  </div>
                  <div className="mono" style={{ marginTop: 4, fontSize: 11, color: "var(--text-2)" }}>
                    {service.url}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      default:
        return (
          <div className="setup-step-content">
            <button className="landing-try-button" onClick={proceedToDashboard}>
              Proceed to Dashboard <ArrowRight size={16} />
            </button>
            <div className="setup-inline-note">Setup complete. Jump into live operations.</div>
          </div>
        );
    }
  };

  const step = steps[currentStep]!;
  const meta = STEP_META[currentStep]!;

  return (
    <div className="setup-funnel">
      <div className="escape-cluster">
        <button className="escape-button" onClick={escapeNextStep}>Skip Step</button>
        <button className="escape-button" onClick={escapeDashboard}>Skip to Dashboard</button>
      </div>

      <div className="setup-sequence-head">
        <p className="setup-sequence-kicker mono">Sequence</p>
        <p className="setup-sequence-count mono">{String(currentStep + 1).padStart(2, "0")} / {String(STEP_META.length).padStart(2, "0")}</p>
      </div>

      <div className="setup-progress-track setup-progress-track-hero">
        <motion.div className="setup-progress-fill" animate={{ width: `${progressPct}%` }} transition={{ duration: 0.35, ease: "easeOut" }} />
      </div>

      <div className="setup-progress-steps">
        {STEP_META.map((item, index) => (
          <div key={item.title} className={`setup-step-pill ${index === currentStep ? "active" : ""} ${steps[index]?.completed ? "done" : ""}`}>
            <span className="mono">{String(index + 1).padStart(2, "0")}</span>
            <span>{item.title}</span>
          </div>
        ))}
      </div>

      <div className="setup-stage">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 48, scale: 0.98 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -48, scale: 0.98 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="setup-slide setup-slide-surface"
          >
            <h3 className="setup-slide-title">{meta.title}</h3>
            <p className="setup-slide-copy">{meta.copy}</p>
            {content()}
            {step.error && <div className="notice" style={{ marginTop: 10 }}>{step.error}</div>}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
