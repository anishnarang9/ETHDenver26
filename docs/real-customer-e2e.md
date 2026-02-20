# Real-Customer Localhost E2E

This runbook validates a real customer model:
- Owner wallet only signs passport/session writes in web.
- Customer agent keeps agent/session/payment keys locally.
- Gateway enforces passport/session/scope/service/rate/budget guardrails.
- Payment occurs on upstream routes (pass-through billing model).

## 1. Start Services

Terminal 1:
```bash
cd /Users/anishnarang/ETHDenver26
pnpm --filter @kite-stack/gateway dev
```

Terminal 2:
```bash
cd /Users/anishnarang/ETHDenver26
pnpm --filter @kite-stack/web dev
```

Terminal 3:
```bash
cd /Users/anishnarang/ETHDenver26
pnpm --filter @kite-stack/weather-fallback-provider dev
```

Terminal 4 (first run, prints onboarding addresses):
```bash
cd /Users/anishnarang/ETHDenver26
pnpm --filter @kite-stack/customer-agent dev
```

## 2. Owner Onboarding in Web

Open `http://localhost:3000` and connect the owner wallet.

In the passport editor:
1. Paste `agent=<...>` and `session=<...>` from customer-agent output.
2. Keep or adjust default scopes/services:
- scopes include `weather.kite.read` and `weather.fallback.read`.
- services include `external.kite.weather` and `external.fallback.weather`.
3. Click `Upsert Passport`.
4. Click `Grant Session`.

## 3. Execute Customer Agent Spend Flow

Re-run customer agent:
```bash
cd /Users/anishnarang/ETHDenver26
pnpm --filter @kite-stack/customer-agent dev
```

Expected behavior:
1. Agent attempts `POST /api/weather-kite` through gateway.
2. Customer-agent first tries x402 auto-settlement adapters (Exact v1/v2 via `@x402/*`).
3. Upstream weather currently returns `gokite-aa`, which is not available in the configured adapters.
4. Agent auto-falls back to `POST /api/weather-fallback`.
5. Fallback returns 402 challenge.
6. Agent sends testnet USDT transfer (`X-TX-HASH`) and retries.
7. Fallback returns 200 weather payload.

## 4. Collect Evidence

Use addresses from customer-agent output:
```bash
curl -s http://localhost:4001/api/passport/<AGENT_ADDRESS>
curl -s http://localhost:4001/api/timeline/<AGENT_ADDRESS>
curl -s http://localhost:4001/api/actions/<ACTION_ID>
```

What to confirm:
- `IDENTITY_VERIFIED`, `SESSION_VERIFIED`, `PASSPORT_VERIFIED` events exist.
- Primary route attempt is visible (`api.kite-weather-proxy`).
- Fallback route paid success is visible (`api.weather-fallback-proxy`).
- Customer-agent logs include fallback transfer `txHash`.

## 5. Revocation Proof

In web, click `Revoke Passport` for the same agent.

Re-run customer-agent:
```bash
cd /Users/anishnarang/ETHDenver26
pnpm --filter @kite-stack/customer-agent dev
```

Expected:
- Gateway rejects before upstream call with passport/session policy error.
- Timeline shows `REQUEST_BLOCKED` with revoked/expired code.
