"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence, useMotionValue, animate } from "framer-motion";
import { Wallet, TrendingUp, TrendingDown, Map, Utensils, Calendar } from "lucide-react";
import { useWalletBalance, BalanceDirection } from "../hooks/use-wallet-balance";

const rpcUrl = process.env.NEXT_PUBLIC_KITE_RPC_URL || "https://rpc-testnet.gokite.ai/";
const asset = process.env.NEXT_PUBLIC_PAYMENT_ASSET || "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63";

interface AgentWallet {
  name: string;
  address: string;
  color: string;
}

/* Map agent names to role icons and emoji fallbacks */
const agentMeta: Record<string, { icon: typeof Wallet; emoji: string }> = {
  Planner: { icon: Wallet, emoji: "\uD83E\uDDE0" },
  Rider:   { icon: Map, emoji: "\uD83D\uDE97" },
  Foodie:  { icon: Utensils, emoji: "\uD83C\uDF54" },
  EventBot:{ icon: Calendar, emoji: "\uD83C\uDF9F\uFE0F" },
};

/* ---------- stagger container ---------- */
const containerVariants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.1,
    },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 18, scale: 0.95 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", stiffness: 260, damping: 20 },
  },
};

/* ==================== WalletBalances ==================== */
export function WalletBalances({ wallets }: { wallets: AgentWallet[] }) {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}
    >
      {wallets.map((w) => (
        <WalletCard key={w.name} wallet={w} />
      ))}
    </motion.div>
  );
}

/* ==================== Animated Counter ==================== */
function AnimatedBalance({ value, color }: { value: string; color: string }) {
  const numericTarget = parseFloat(value) || 0;
  const motionVal = useMotionValue(0);
  const [text, setText] = useState("0.00");

  useEffect(() => {
    const controls = animate(motionVal, numericTarget, {
      duration: 0.8,
      ease: [0.25, 0.46, 0.45, 0.94],
      onUpdate: (latest) => setText(latest.toFixed(2)),
    });
    return () => controls.stop();
  }, [numericTarget, motionVal]);

  return (
    <span style={{ fontSize: "1.15rem", fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>
      {text}
    </span>
  );
}

/* ==================== Flash overlay for balance changes ==================== */
function ChangeFlash({ direction }: { direction: BalanceDirection }) {
  return (
    <AnimatePresence>
      {direction !== "none" && (
        <motion.div
          key={direction}
          initial={{ opacity: 0.55 }}
          animate={{ opacity: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.0, ease: "easeOut" }}
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "8px",
            pointerEvents: "none",
            background:
              direction === "up"
                ? "radial-gradient(ellipse at center, rgba(52,211,153,0.25) 0%, transparent 70%)"
                : "radial-gradient(ellipse at center, rgba(248,113,113,0.25) 0%, transparent 70%)",
          }}
        />
      )}
    </AnimatePresence>
  );
}

/* ==================== Polling activity indicator ==================== */
function PollingDot({ active }: { active: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: active ? "#34d399" : "#334155",
        boxShadow: active ? "0 0 6px 2px rgba(52,211,153,0.5)" : "none",
        transition: "all 0.3s ease",
        marginLeft: 6,
        verticalAlign: "middle",
      }}
    />
  );
}

/* ==================== Direction arrow badge ==================== */
function DirectionBadge({ direction }: { direction: BalanceDirection }) {
  if (direction === "none") return null;

  const isUp = direction === "up";
  const Icon = isUp ? TrendingUp : TrendingDown;
  const badgeColor = isUp ? "#34d399" : "#f87171";
  const bgColor = isUp ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)";

  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.5, x: -4 }}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.5 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        marginLeft: 6,
        padding: "1px 5px",
        borderRadius: 4,
        background: bgColor,
        color: badgeColor,
        fontSize: "0.6rem",
        fontWeight: 600,
      }}
    >
      <Icon size={10} />
    </motion.span>
  );
}

/* ==================== WalletCard ==================== */
function WalletCard({ wallet }: { wallet: AgentWallet }) {
  const { balance, direction, isPolling } = useWalletBalance(wallet.address, rpcUrl, asset);
  const meta = agentMeta[wallet.name] || { icon: Wallet, emoji: "\uD83D\uDCB0" };
  const RoleIcon = meta.icon;

  return (
    <motion.div
      variants={cardVariants}
      whileHover={{ scale: 1.03, boxShadow: `0 0 20px ${wallet.color}22` }}
      style={{
        position: "relative",
        padding: "10px 12px",
        background: "#0f172a",
        borderRadius: "8px",
        borderLeft: `3px solid ${wallet.color}`,
        overflow: "hidden",
        cursor: "default",
      }}
    >
      {/* Flash overlay */}
      <ChangeFlash direction={direction} />

      {/* Header row: role icon + name + polling dot */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
        <RoleIcon size={12} style={{ color: wallet.color, flexShrink: 0 }} />
        <span style={{ fontSize: "0.75rem", color: "#64748b" }}>{wallet.name}</span>
        <PollingDot active={isPolling} />
      </div>

      {/* Balance row */}
      <div style={{ display: "flex", alignItems: "center" }}>
        <AnimatedBalance value={balance} color="#e2e8f0" />
        <AnimatePresence mode="wait">
          <DirectionBadge key={direction} direction={direction} />
        </AnimatePresence>
      </div>

      {/* Address */}
      <div style={{ fontSize: "0.6rem", color: "#475569", fontFamily: "monospace", marginTop: 2 }}>
        {wallet.address.slice(0, 8)}...{wallet.address.slice(-6)}
      </div>

      {/* Subtle bottom glow line that matches the agent color */}
      <motion.div
        animate={{
          opacity: [0.15, 0.35, 0.15],
        }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 1,
          background: `linear-gradient(90deg, transparent, ${wallet.color}, transparent)`,
        }}
      />
    </motion.div>
  );
}
