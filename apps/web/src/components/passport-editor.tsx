"use client";

import { useMemo, useState } from "react";
import { Wallet } from "ethers";
import {
  grantSessionOnchain,
  revokePassportOnchain,
  upsertPassportOnchain,
} from "../lib/onchain";

const splitCsv = (value: string) =>
  value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

export function PassportEditor(props: {
  ownerAddress?: string;
  onAgentChanged: (agent: string) => void;
  onAction: (message: string) => void;
}) {
  const [agentAddress, setAgentAddress] = useState("");
  const [sessionAddress, setSessionAddress] = useState("");
  const [scopes, setScopes] = useState(
    "enrich.wallet,premium.intel,weather.kite.read,weather.fallback.read"
  );
  const [services, setServices] = useState(
    "internal.enrich,external.premium,external.kite.weather,external.fallback.weather"
  );
  const [expiresInHours, setExpiresInHours] = useState("24");
  const [perCallCap, setPerCallCap] = useState("5000000");
  const [dailyCap, setDailyCap] = useState("50000000");
  const [rateLimit, setRateLimit] = useState("20");
  const [status, setStatus] = useState("No on-chain updates yet.");

  const expiresAt = useMemo(() => {
    const hours = Number(expiresInHours || "0");
    return Math.floor(Date.now() / 1000) + hours * 3600;
  }, [expiresInHours]);

  const ensureAgentInput = (): boolean => {
    if (!agentAddress || !agentAddress.startsWith("0x")) {
      setStatus("Set a valid agent address from your customer-agent script before writing on-chain.");
      return false;
    }
    return true;
  };

  const ensureSessionInput = (): boolean => {
    if (!sessionAddress || !sessionAddress.startsWith("0x")) {
      setStatus("Set a valid session address from your customer-agent script before granting session.");
      return false;
    }
    return true;
  };

  const handleUpsert = async () => {
    if (!ensureAgentInput()) {
      return;
    }

    try {
      const result = await upsertPassportOnchain({
        agentAddress,
        expiresAt,
        perCallCap,
        dailyCap,
        rateLimitPerMin: Number(rateLimit),
        scopes: splitCsv(scopes),
        services: splitCsv(services),
      });
      setStatus(
        result.explorerLink
          ? `Passport updated: ${result.txHash} (${result.explorerLink})`
          : `Passport updated on-chain: ${result.txHash}`
      );
      props.onAgentChanged(agentAddress);
      props.onAction(`Passport upserted for ${agentAddress}`);
    } catch (error) {
      setStatus(`Upsert failed: ${(error as Error).message}`);
    }
  };

  const handleSessionGrant = async () => {
    if (!ensureAgentInput() || !ensureSessionInput()) {
      return;
    }

    try {
      const result = await grantSessionOnchain({
        agentAddress,
        sessionAddress,
        expiresAt,
        scopes: splitCsv(scopes),
      });
      setStatus(
        result.explorerLink
          ? `Session granted: ${result.txHash} (${result.explorerLink})`
          : `Session granted: ${result.txHash}`
      );
      props.onAction(`Session granted for ${sessionAddress}`);
    } catch (error) {
      setStatus(`Session grant failed: ${(error as Error).message}`);
    }
  };

  const handleRevoke = async () => {
    if (!ensureAgentInput()) {
      return;
    }

    try {
      const result = await revokePassportOnchain({
        agentAddress,
      });
      setStatus(
        result.explorerLink
          ? `Passport revoked: ${result.txHash} (${result.explorerLink})`
          : `Passport revoked: ${result.txHash}`
      );
      props.onAction(`Passport revoked for ${agentAddress}`);
    } catch (error) {
      setStatus(`Revocation failed: ${(error as Error).message}`);
    }
  };

  return (
    <div className="panel">
      <h2>Agent Passport + Delegation</h2>
      <div className="status">
        Owner wallet signs passport/session writes. Agent keys stay with the customer and are never shared.
      </div>
      <div className="status">
        Paste agent/session addresses printed by <code>apps/customer-agent</code>. Use test key generation only for local debugging.
      </div>
      <div style={{ marginTop: 10 }}>
        <button
          onClick={() => {
            setAgentAddress(Wallet.createRandom().address);
            setSessionAddress(Wallet.createRandom().address);
            setStatus("Generated temporary local test keys. Replace with customer agent/session for real-customer flow.");
          }}
        >
          Generate Test Keys (Local Only)
        </button>
      </div>
      <div className="form-grid">
        <div>
          <label>Connected Owner</label>
          <input value={props.ownerAddress || "not connected"} readOnly />
        </div>
        <div>
          <label>Agent Address</label>
          <input
            value={agentAddress}
            onChange={(event) => setAgentAddress(event.target.value)}
            placeholder="0x..."
          />
        </div>
        <div>
          <label>Session Address</label>
          <input
            value={sessionAddress}
            onChange={(event) => setSessionAddress(event.target.value)}
            placeholder="0x..."
          />
        </div>
        <div>
          <label>Scopes (csv)</label>
          <input value={scopes} onChange={(event) => setScopes(event.target.value)} />
        </div>
        <div>
          <label>Services (csv)</label>
          <input value={services} onChange={(event) => setServices(event.target.value)} />
        </div>
        <div>
          <label>Per Call Cap (atomic)</label>
          <input value={perCallCap} onChange={(event) => setPerCallCap(event.target.value)} />
        </div>
        <div>
          <label>Daily Cap (atomic)</label>
          <input value={dailyCap} onChange={(event) => setDailyCap(event.target.value)} />
        </div>
        <div>
          <label>Rate Limit per Minute</label>
          <input value={rateLimit} onChange={(event) => setRateLimit(event.target.value)} />
        </div>
        <div>
          <label>Expiry (hours from now)</label>
          <input value={expiresInHours} onChange={(event) => setExpiresInHours(event.target.value)} />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10, marginTop: 12 }}>
        <button onClick={handleUpsert}>Upsert Passport</button>
        <button className="warn" onClick={handleSessionGrant}>
          Grant Session
        </button>
        <button className="danger" onClick={handleRevoke}>
          Revoke Passport
        </button>
      </div>
      <div className="status">All writes are signed in your browser wallet. Private keys are never sent to the server.</div>
      <div className="status">{status}</div>
    </div>
  );
}
