# Agent Passport Commerce Stack Architecture

## Goals
- Verify autonomous agent identity and delegation.
- Enforce policy (scope, service allowlist, rate, budget, revocation).
- Run machine-readable x402-style payment challenge and proof flow (facilitator signature or direct transfer).
- Record receipts on-chain for auditability.

## Components

### 1. Web Dashboard (`apps/web`)
- Passport policy editor (owner -> agent policy).
- Session grant controls (owner -> session key).
- Timeline panel backed by gateway event store.
- Action/passport inspector for demo traceability.

### 2. Enforcement Gateway (`apps/gateway`)
- Fastify API with priced routes:
  - `POST /api/enrich-wallet`
  - `POST /api/premium-intel`
- Operational routes:
  - `GET /health`
  - `GET /api/passport/:agent`
  - `GET /api/actions/:actionId`
  - `GET /api/timeline/:agent`
  - `GET /api/timeline/:agent/stream` (SSE)
- Uses provider-kit middleware to enforce policy in strict order.
- Supports runtime route pricing profiles:
  - `demo`: showcase prices
  - `test`: low-cost prices for repeated test rounds
- Includes KITE-only spend guard script for gateway signer operations.

Passport/session/revoke writes are executed directly from the web app via wallet signatures to on-chain contracts.

### 3. Planner + Specialist Agents (`apps/planner`, `apps/rider`, `apps/foodie`, `apps/eventbot`)
- Planner orchestrates work, hires specialists, and handles weather calls.
- Specialists expose priced routes:
  - Rider: `POST /api/find-rides`
  - Foodie: `POST /api/find-restaurants`
  - EventBot: `POST /api/find-events`, `POST /api/register-event`
- Each service runs provider-kit enforcement with in-memory stores (fast demo loop), while still verifying on-chain passport/session state.
- SSE feed on each service at `GET /api/events`.

### 4. Provider Kit (`packages/provider-kit`)
- Reusable middleware + route policy config.
- Signed envelope headers:
  - `x-agent-address`, `x-session-address`, `x-timestamp`, `x-nonce`, `x-body-hash`, `x-signature`
- Dual payment proof compatibility:
  - Legacy `X-PAYMENT` + `X-ACTION-ID`
  - x402-style `PAYMENT-SIGNATURE` + `X-ACTION-ID`
  - Direct transfer via `X-TX-HASH` + `X-ACTION-ID`
- Challenge headers include `PAYMENT-REQUIRED`, `PAYMENT-RESPONSE`, and `X-PAYMENT-RESPONSE`.
- Includes in-memory stores for quotes, budgets, nonces, receipts, and events.

### 5. Contracts (`packages/contracts`)
- `PassportRegistry.sol`
- `SessionRegistry.sol`
- `ReceiptLog.sol`
- Hardhat deploy script and unit tests.

### 6. Runner (`apps/runner`)
- Simulates autonomous agent loop:
  - Call priced route.
  - Receive 402 challenge.
  - Pay via facilitator (if enabled).
  - Fallback to direct ERC20 transfer.
  - Retry with proof.
- Deterministic controls for route subset selection and loop iterations.

### 7. Persistence (`packages/db`)
- Prisma/Postgres schema for timeline, actions, quotes, settlements, receipts, and nonce replay prevention.

## Enforcement Sequence
1. Verify signed request envelope.
2. Check nonce replay (session + nonce).
3. Verify session active, not revoked, delegated to agent.
4. Verify passport exists, not revoked, not expired.
5. Verify route scope and service allowlist.
6. Check rate limit.
7. Check per-call and daily budget caps.
8. If no proof, return 402 challenge payload + dual headers.
9. Verify payment proof (facilitator first, direct fallback).
10. Record receipt and persist timeline event.
11. Return route response.

## Event Model
- Events written per `actionId` include:
  - `IDENTITY_VERIFIED`
  - `SESSION_VERIFIED`
  - `PASSPORT_VERIFIED`
  - `SCOPE_VERIFIED`
  - `SERVICE_VERIFIED`
  - `RATE_LIMIT_VERIFIED`
  - `BUDGET_VERIFIED`
  - `QUOTE_ISSUED`
  - `PAYMENT_VERIFIED`
  - `RECEIPT_RECORDED`
  - `REQUEST_BLOCKED`

## Security Notes
- Session key signs each request; owner key is not required per request.
- Nonce table enforces anti-replay per session key.
- Revocation blocks future calls immediately via on-chain state checks.
- Receipt log enforces one record per action id (replay protection).
