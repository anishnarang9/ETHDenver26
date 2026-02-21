# Setup and Runbook

## 1. Prerequisites
- Node.js 20+
- pnpm 9+
- Postgres 14+
- Kite testnet RPC endpoint + funded test wallets

## 2. Install
```bash
pnpm install
```

## 3. Configure Environment

### 3.1 Root runtime env
```bash
cp .env.example .env
```
Fill required values in `.env`:
- `DATABASE_URL`
- `KITE_RPC_URL`
- `PASSPORT_REGISTRY_ADDRESS`, `SESSION_REGISTRY_ADDRESS`, `RECEIPT_LOG_ADDRESS`
- `PAYMENT_ASSET`
- `GATEWAY_SIGNER_PRIVATE_KEY`, `PAYMENT_RECIPIENT`
- `OPENAI_API_KEY`
- `PLANNER_AGENT_PRIVATE_KEY`, `PLANNER_SESSION_PRIVATE_KEY`, `PLANNER_PAYMENT_PRIVATE_KEY`
- `RIDER_AGENT_PRIVATE_KEY`, `FOODIE_AGENT_PRIVATE_KEY`, `EVENTBOT_AGENT_PRIVATE_KEY`

Notes:
- Specialist services support dedicated keys via:
  - `RIDER_AGENT_PRIVATE_KEY`
  - `FOODIE_AGENT_PRIVATE_KEY`
  - `EVENTBOT_AGENT_PRIVATE_KEY`
- If those are omitted, they fall back to `AGENT_PRIVATE_KEY`.

### 3.2 Web env
```bash
cp apps/web/.env.example apps/web/.env.local
```
Fill:
- `NEXT_PUBLIC_GATEWAY_URL` (default `http://localhost:4001`)
- `NEXT_PUBLIC_PLANNER_URL` (default `http://localhost:4005`)
- `NEXT_PUBLIC_PASSPORT_REGISTRY_ADDRESS`
- `NEXT_PUBLIC_SESSION_REGISTRY_ADDRESS`
- `NEXT_PUBLIC_EVENTBOT_AGENT_ADDRESS` (for revoke button)

## 4. Database
```bash
pnpm db:generate
pnpm db:migrate
```

## 5. Deploy Contracts
```bash
pnpm --filter @kite-stack/contracts deploy:kite-testnet
```
Capture deployed addresses and update `.env`:
- `PASSPORT_REGISTRY_ADDRESS`
- `SESSION_REGISTRY_ADDRESS`
- `RECEIPT_LOG_ADDRESS`

## 6. Start Services

### 6.1 One-command startup (core TripDesk stack)
```bash
pnpm dev
```
This runs:
- gateway (`:4001`)
- rider (`:4002`)
- foodie (`:4003`)
- eventbot (`:4004`)
- planner (`:4005`)
- web (`:3000`)

### 6.2 Start individually (optional)
```bash
pnpm dev:gateway
pnpm dev:rider
pnpm dev:foodie
pnpm dev:eventbot
pnpm dev:planner
pnpm dev:web
```

## 7. Smoke Checks
```bash
curl -sS http://localhost:4001/health
curl -sS http://localhost:4002/health
curl -sS http://localhost:4003/health
curl -sS http://localhost:4004/health
curl -sS http://localhost:4005/health
```
Open:
- `http://localhost:3000`
- `http://localhost:3000/console`

## 8. Trigger a Run

Manual trigger:
```bash
curl -sS -X POST http://localhost:4005/api/trigger \
  -H 'content-type: application/json' \
  -d '{"action":"plan-trip"}'
```

Optional canned scenarios:
- `additional-search`
- `scope-violation`
- `post-revoke-test`

Replay recent runs:
```bash
curl -sS http://localhost:4005/api/runs
```

## 9. Optional Legacy Flows (Gateway-Focused)
These are still available in this repo:
- `apps/customer-agent`
- `apps/weather-fallback-provider`
- `apps/runner`

Use if you want the original gateway/customer-agent validation track in addition to TripDesk.

## 10. Continuous Validation
```bash
pnpm -r test
pnpm -r typecheck
pnpm -r build
```

## 11. Important Notes
- Full end-to-end demo behavior (real AgentMail, Firecrawl browsing, Pieverse settlement, on-chain tx links) requires valid external API keys and funded wallets.
- Without those, services still boot and health checks pass, but live orchestration actions may degrade to fallback behavior.
