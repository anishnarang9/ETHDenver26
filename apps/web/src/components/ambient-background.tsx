"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export function AmbientBackground() {
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      const x = (event.clientX / window.innerWidth - 0.5) * 26;
      const y = (event.clientY / window.innerHeight - 0.5) * 26;
      setOffset({ x, y });
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  return (
    <>
      <div className="ambient-grid" />
      <motion.div
        className="ambient-orb one"
        animate={{ x: offset.x * 0.4, y: offset.y * 0.3 }}
        transition={{ type: "spring", stiffness: 40, damping: 22 }}
      />
      <motion.div
        className="ambient-orb two"
        animate={{ x: offset.x * -0.5, y: offset.y * 0.35 }}
        transition={{ type: "spring", stiffness: 30, damping: 20 }}
      />
      <motion.div
        className="ambient-orb three"
        animate={{ x: offset.x * 0.32, y: offset.y * -0.42 }}
        transition={{ type: "spring", stiffness: 28, damping: 20 }}
      />
    </>
  );
}
