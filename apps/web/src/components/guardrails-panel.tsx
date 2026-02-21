"use client";

import { useState } from "react";
import { Wallet } from "ethers";
import { grantSessionOnchain, revokePassportOnchain, upsertPassportOnchain } from "../lib/onchain";

const splitCsv = (value: string) =>
  value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

export function GuardrailsPanel() {
  const [agentAddress, setAgentAddress] = useState(process.env.NEXT_PUBLIC_PLANNER_ADDRESS || Wallet.createRandom().address);
  const [sessionAddress, setSessionAddress] = useState(Wallet.createRandom().address);
  const [scopes, setScopes] = useState("travel,transport,food,events,search,booking");
  const [services, setServices] = useState("gateway,planner,rider,foodie,eventbot");
  const [expiresInHours, setExpiresInHours] = useState("24");
  const [perCallCap, setPerCallCap] = useState("2000000000000000000");
  const [dailyCap, setDailyCap] = useState("20000000000000000000");
  const [rateLimit, setRateLimit] = useState("30");
  const [status, setStatus] = useState("No on-chain writes yet.");

  const expiresAt = Math.floor(Date.now() / 1000) + Number(expiresInHours || "0") * 3600;

  const upsert = async () => {
    try {
      const tx = await upsertPassportOnchain({
        agentAddress,
        expiresAt,
        perCallCap,
        dailyCap,
        rateLimitPerMin: Number(rateLimit),
        scopes: splitCsv(scopes),
        services: splitCsv(services),
      });
      setStatus(`Passport updated: ${tx.txHash}`);
    } catch (error) {
      setStatus(`Upsert failed: ${(error as Error).message}`);
    }
  };

  const grant = async () => {
    try {
      const tx = await grantSessionOnchain({
        agentAddress,
        sessionAddress,
        expiresAt,
        scopes: splitCsv(scopes),
      });
      setStatus(`Session granted: ${tx.txHash}`);
    } catch (error) {
      setStatus(`Session grant failed: ${(error as Error).message}`);
    }
  };

  const revoke = async () => {
    try {
      const tx = await revokePassportOnchain({ agentAddress });
      setStatus(`Passport revoked: ${tx.txHash}`);
    } catch (error) {
      setStatus(`Revoke failed: ${(error as Error).message}`);
    }
  };

  return (
    <div className="panel" style={{ marginTop: 14 }}>
      <h3 className="panel-title">Passport and Session Controls</h3>

      <div className="field-grid" style={{ marginTop: 12 }}>
        <div className="field">
          <label className="label">Agent Address</label>
          <input className="input mono" value={agentAddress} onChange={(event) => setAgentAddress(event.target.value)} />
        </div>
        <div className="field">
          <label className="label">Session Address</label>
          <input className="input mono" value={sessionAddress} onChange={(event) => setSessionAddress(event.target.value)} />
        </div>
        <div className="field">
          <label className="label">Scopes (csv)</label>
          <input className="input" value={scopes} onChange={(event) => setScopes(event.target.value)} />
        </div>
        <div className="field">
          <label className="label">Services (csv)</label>
          <input className="input" value={services} onChange={(event) => setServices(event.target.value)} />
        </div>
        <div className="field">
          <label className="label">Per Call Cap (atomic)</label>
          <input className="input mono" value={perCallCap} onChange={(event) => setPerCallCap(event.target.value)} />
        </div>
        <div className="field">
          <label className="label">Daily Cap (atomic)</label>
          <input className="input mono" value={dailyCap} onChange={(event) => setDailyCap(event.target.value)} />
        </div>
        <div className="field">
          <label className="label">Rate Limit / Min</label>
          <input className="input" value={rateLimit} onChange={(event) => setRateLimit(event.target.value)} />
        </div>
        <div className="field">
          <label className="label">Expiry (hours)</label>
          <input className="input" value={expiresInHours} onChange={(event) => setExpiresInHours(event.target.value)} />
        </div>
      </div>

      <div className="inline-actions" style={{ marginTop: 12 }}>
        <button className="primary-button" onClick={upsert}>Upsert Passport</button>
        <button className="secondary-button" onClick={grant}>Grant Session</button>
        <button className="danger-button" onClick={revoke}>Revoke Passport</button>
      </div>

      <div className="event-item" style={{ marginTop: 10 }}>
        <div style={{ fontSize: 12, color: "var(--text-2)" }}>{status}</div>
      </div>
    </div>
  );
}
