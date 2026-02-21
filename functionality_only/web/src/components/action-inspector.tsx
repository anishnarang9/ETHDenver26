"use client";

import { useState } from "react";
import { getAction, getPassport } from "../lib/api";

export function ActionInspector(props: { agentAddress: string }) {
  const [actionId, setActionId] = useState("");
  const [output, setOutput] = useState<string>("No data loaded.");

  const loadAction = async () => {
    try {
      const data = await getAction(actionId);
      setOutput(JSON.stringify(data, null, 2));
    } catch (error) {
      setOutput(`Action lookup failed: ${(error as Error).message}`);
    }
  };

  const loadPassport = async () => {
    try {
      if (!props.agentAddress) {
        setOutput("Set an agent address first in Passport panel.");
        return;
      }
      const data = await getPassport(props.agentAddress);
      setOutput(JSON.stringify(data, null, 2));
    } catch (error) {
      setOutput(`Passport lookup failed: ${(error as Error).message}`);
    }
  };

  return (
    <div className="panel">
      <h2>Action and Passport Inspector</h2>
      <div className="form-grid">
        <div>
          <label>Action ID</label>
          <input value={actionId} onChange={(event) => setActionId(event.target.value)} placeholder="UUID" />
        </div>
        <div>
          <label>Current Agent</label>
          <input value={props.agentAddress || "not set"} readOnly />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10, marginTop: 12 }}>
        <button className="secondary" onClick={loadAction}>
          Load Action
        </button>
        <button className="secondary" onClick={loadPassport}>
          Load Passport
        </button>
      </div>
      <textarea style={{ marginTop: 12, minHeight: 220 }} value={output} readOnly />
    </div>
  );
}
