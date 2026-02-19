# Agent Passport Commerce Stack Architecture

## Goals
- Verify autonomous agent identity and delegation.
- Enforce policy (scope, service allowlist, rate, budget, revocation).
- Run machine-readable x402-style payment challenge and proof flow.
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
  - `GET /api/passport/:agent`
  - `POST /api/passport/upsert`
  - `POST /api/passport/revoke`
  - `POST /api/session/grant`
  - `GET /api/actions/:actionId`
  - `GET /api/timeline/:agent`
  - `GET /api/timeline/:agent/stream`
- Uses provider-kit middleware to enforce policy in strict order.

### 3. Provider Kit (`packages/provider-kit`)
- Reusable middleware and route policy config.
- Dual header compatibility:
  - Legacy `X-PAYMENT*`
  - x402-style `PAYMENT-*`
- Challenge generation and proof verification interfaces.
- Includes in-memory implementations and sample Fastify provider.

### 4. Contracts (`packages/contracts`)
- `PassportRegistry.sol`
- `SessionRegistry.sol`
- `ReceiptLog.sol`
- Hardhat deploy script and unit tests.

### 5. Runner (`apps/runner`)
- Simulates autonomous agent loop:
  - Call priced route.
  - Receive 402 challenge.
  - Pay via facilitator.
  - Fallback to direct ERC20 transfer.
  - Retry with proof.

### 6. Persistence (`packages/db`)
- Prisma/Postgres schema for timeline, actions, quotes, settlements, receipts, and nonce replay prevention.

## Enforcement Sequence
1. Verify signed request envelope.
2. Verify session active and delegated to agent.
3. Verify passport exists, not revoked, not expired.
4. Verify route scope and service allowlist.
5. Check nonce replay.
6. Check rate limit.
7. Check per-call and daily budget caps.
8. If no proof, return 402 challenge payload + dual headers.
9. Verify payment proof (facilitator first, direct fallback).
10. Record on-chain receipt and persist timeline event.
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
