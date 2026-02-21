"use client";

import { useEffect } from "react";

export default function ConsoleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Console route error", error);
  }, [error]);

  return (
    <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: "24px" }}>
      <div className="panel" style={{ maxWidth: 620, width: "100%" }}>
        <h2 className="page-title" style={{ fontSize: 34 }}>Console Recovery</h2>
        <p className="page-subtitle" style={{ marginTop: 10 }}>
          The dashboard hit a runtime error. Use retry to recover without reloading the whole app.
        </p>
        <div className="notice" style={{ marginTop: 12 }}>
          {error.message || "Unknown dashboard runtime error"}
        </div>
        <div className="inline-actions" style={{ marginTop: 12 }}>
          <button className="primary-button" onClick={reset}>Retry Console</button>
          <a className="secondary-button" href="/setup">Back to Setup</a>
          <a className="secondary-button" href="/">Home</a>
        </div>
      </div>
    </div>
  );
}
