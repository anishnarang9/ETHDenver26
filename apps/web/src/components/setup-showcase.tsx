"use client";

import { motion } from "framer-motion";

export function SetupShowcase() {
  return (
    <div className="setup-showcase" aria-hidden>
      <div className="setup-showcase-bg" />

      <motion.div
        className="setup-orbital-ring ring-a"
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 20, ease: "linear" }}
      />
      <motion.div
        className="setup-orbital-ring ring-b"
        animate={{ rotate: -360 }}
        transition={{ repeat: Infinity, duration: 28, ease: "linear" }}
      />

      <motion.div
        className="setup-kite-scene"
        animate={{ y: [0, -10, 0], rotateZ: [-1.5, 1.5, -1.5] }}
        transition={{ repeat: Infinity, duration: 6.8, ease: "easeInOut" }}
      >
        <div className="kite-core">
          <span className="kite-wing left" />
          <span className="kite-wing right" />
          <span className="kite-body" />
        </div>
        <motion.div
          className="kite-tail"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
        />
      </motion.div>

      <div className="setup-showcase-caption">
        <p className="mono">KITE CONTROL LINK</p>
        <h4>Kite AI Mission Handshake</h4>
        <p>Policy, session, and payment rails arm in sequence before runtime autonomy is unlocked.</p>
      </div>
    </div>
  );
}
