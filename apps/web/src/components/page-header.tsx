"use client";

import { motion } from "framer-motion";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}
    >
      <div>
        <h2 className="page-title">{title}</h2>
        <p className="page-subtitle">{subtitle}</p>
      </div>
      {action}
    </motion.div>
  );
}
