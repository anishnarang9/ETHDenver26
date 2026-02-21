"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { isSetupComplete } from "../lib/setup-state";

const pulse = {
  initial: { opacity: 0.35, scale: 0.92 },
  animate: {
    opacity: [0.35, 0.85, 0.35],
    scale: [0.92, 1.05, 0.92],
    transition: { duration: 6, repeat: Infinity, ease: "easeInOut" },
  },
};

export default function HomePage() {
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    setComplete(isSetupComplete());
  }, []);

  return (
    <div className="landing-fullbleed">
      <div className="landing-noise" />

      <motion.div className="landing-beam beam-a" variants={pulse} initial="initial" animate="animate" />
      <motion.div className="landing-beam beam-b" variants={pulse} initial="initial" animate="animate" />
      <motion.div className="landing-beam beam-c" variants={pulse} initial="initial" animate="animate" />

      <motion.div
        className="landing-copy"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <p className="landing-kicker">
          <Sparkles size={14} /> Autonomous Agent Commerce
        </p>

        <h1 className="landing-headline">
          Control paid AI agents
          <br />
          with enforcement, not hope.
        </h1>

        <p className="landing-subcopy">
          TripDesk gives you a mission-grade surface for orchestrating agent actions, verifying x402 payments,
          and tracking on-chain receipts in real time.
        </p>

        <div className="landing-actions">
          <Link href="/setup" className="landing-try-button">
            Try It <ArrowRight size={16} />
          </Link>
          {complete && (
            <Link href="/console" className="landing-dashboard-link">
              Go to Dashboard
            </Link>
          )}
        </div>

        <p className="landing-footnote">Flow: Landing to Setup to Dashboard</p>
      </motion.div>

      <motion.div
        className="landing-orbit"
        animate={{ rotate: 360 }}
        transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
      >
        <span className="orbit-dot one" />
        <span className="orbit-dot two" />
        <span className="orbit-dot three" />
      </motion.div>
    </div>
  );
}
