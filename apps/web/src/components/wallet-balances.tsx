"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence, useMotionValue, animate } from "framer-motion";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Map,
  Utensils,
  Calendar,
  Copy,
  ExternalLink,
  CircleDot,
} from "lucide-react";
import { useWalletBalance, BalanceDirection } from "../hooks/use-wallet-balance";

const rpcUrl = process.env.NEXT_PUBLIC_KITE_RPC_URL || "https://rpc-testnet.gokite.ai/";
const asset = process.env.NEXT_PUBLIC_PAYMENT_ASSET || "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63";
const explorerBase =
  process.env.NEXT_PUBLIC_EXPLORER_BASE_URL || "https://testnet.kitescan.ai";

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
  hidden: { opacity: 0, y: 20, scale: 0.95 },
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
function AnimatedBalance({ value, direction, color }: { value: string; direction: BalanceDirection; color: string }) {
  const numericTarget = parseFloat(value) || 0;
  const motionVal = useMotionValue(0);
  const [text, setText] = useState("0.00");
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    const controls = animate(motionVal, numericTarget, {
      duration: 0.8,
      ease: [0.25, 0.46, 0.45, 0.94],
      onUpdate: (latest) => setText(latest.toFixed(2)),
    });
    return () => controls.stop();
  }, [numericTarget, motionVal]);

  /* Green flash/glow when balance increases */
  useEffect(() => {
    if (direction === "up") {
      setFlash(true);
      const timeout = setTimeout(() => setFlash(false), 1200);
      return () => clearTimeout(timeout);
    }
  }, [direction, value]);

  return (
    <motion.span
      key={value}
      initial={{ scale: 1 }}
      animate={
        flash
          ? {
              scale: [1, 1.08, 1],
              textShadow: [
                "0 0 0px transparent",
                "0 0 12px rgba(52,211,153,0.8)",
                "0 0 0px transparent",
              ],
            }
          : { scale: 1, textShadow: "0 0 0px transparent" }
      }
      transition={{ duration: 0.8, ease: "easeOut" }}
      style={{
        fontSize: "1.15rem",
        fontWeight: 700,
        color: flash ? "#6ee7b7" : color,
        fontVariantNumeric: "tabular-nums",
        display: "inline-block",
        transition: "color 0.6s ease",
      }}
    >
      {text}
    </motion.span>
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

/* ==================== Polling activity indicator with pulse ==================== */
function PollingDot({ active, color }: { active: boolean; color?: string }) {
  const dotColor = active ? (color || "#34d399") : "#334155";

  return (
    <motion.span
      animate={
        active
          ? {
              scale: [1, 1.5, 1],
              boxShadow: [
                `0 0 4px 1px ${dotColor}66`,
                `0 0 8px 3px ${dotColor}99`,
                `0 0 4px 1px ${dotColor}66`,
              ],
            }
          : { scale: 1, boxShadow: "0 0 0px 0px transparent" }
      }
      transition={
        active
          ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" }
          : { duration: 0.3 }
      }
      style={{
        display: "inline-block",
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: dotColor,
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

/* ==================== Copy Address Button ==================== */
function CopyAddressButton({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard API not available */
    }
  }, [address]);

  return (
    <motion.button
      onClick={handleCopy}
      whileHover={{ scale: 1.2 }}
      whileTap={{ scale: 0.9 }}
      title={copied ? "Copied!" : "Copy address"}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: 2,
        display: "inline-flex",
        alignItems: "center",
        color: copied ? "#34d399" : "#475569",
        transition: "color 0.2s ease",
      }}
    >
      <Copy size={10} />
    </motion.button>
  );
}

/* ==================== Explorer Link Button ==================== */
function ExplorerLinkButton({ address }: { address: string }) {
  const href = `${explorerBase}/address/${address}`;

  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      whileHover={{ scale: 1.2 }}
      whileTap={{ scale: 0.9 }}
      title="View on Kitescan"
      style={{
        display: "inline-flex",
        alignItems: "center",
        color: "#475569",
        padding: 2,
        transition: "color 0.2s ease",
      }}
    >
      <ExternalLink size={10} />
    </motion.a>
  );
}

/* ==================== WalletCard ==================== */
function WalletCard({ wallet }: { wallet: AgentWallet }) {
  const { balance, direction, isPolling } = useWalletBalance(wallet.address, rpcUrl, asset);
  const meta = agentMeta[wallet.name] || { icon: Wallet, emoji: "\uD83D\uDCB0" };
  const RoleIcon = meta.icon;
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.div
      variants={cardVariants}
      whileHover={{ scale: 1.03, y: -2, boxShadow: `0 0 20px ${wallet.color}22` }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
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
      {/* Gradient border overlay on hover (blue-to-purple) */}
      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "8px",
              border: "1px solid transparent",
              background:
                "linear-gradient(#0f172a, #0f172a) padding-box, linear-gradient(135deg, #3b82f6, #8b5cf6, #6366f1) border-box",
              pointerEvents: "none",
              zIndex: 1,
            }}
          />
        )}
      </AnimatePresence>

      {/* Flash overlay */}
      <ChangeFlash direction={direction} />

      {/* Header row: agent color dot + role icon + name + polling dot */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2, position: "relative", zIndex: 2 }}>
        <span
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: wallet.color,
            flexShrink: 0,
          }}
        />
        <RoleIcon size={12} style={{ color: wallet.color, flexShrink: 0 }} />
        <span style={{ fontSize: "0.75rem", color: "#64748b" }}>{wallet.name}</span>
        <PollingDot active={isPolling} color={wallet.color} />
      </div>

      {/* Balance row */}
      <div style={{ display: "flex", alignItems: "center", position: "relative", zIndex: 2 }}>
        <CircleDot size={12} style={{ color: "#475569", marginRight: 5, flexShrink: 0 }} />
        <AnimatedBalance value={balance} direction={direction} color="#e2e8f0" />
        <AnimatePresence mode="wait">
          <DirectionBadge key={direction} direction={direction} />
        </AnimatePresence>
      </div>

      {/* Address row: truncated address + copy + explorer link */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          marginTop: 2,
          position: "relative",
          zIndex: 2,
        }}
      >
        <span
          style={{
            fontSize: "0.6rem",
            color: "#475569",
            fontFamily: "monospace",
          }}
        >
          {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
        </span>
        <CopyAddressButton address={wallet.address} />
        <ExplorerLinkButton address={wallet.address} />
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
