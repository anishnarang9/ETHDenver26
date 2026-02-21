# TripDesk Architecture

## Goals
- Multi-agent trip planning with specialized agents (planner, rider, foodie, eventbot).
- x402-gated inter-agent calls with policy enforcement.
- On-chain passport/session guardrails and receipt logging.
- Real-time mission observability via SSE and console UI.

## Core Services

### 1. Planner (`apps/planner`)
- Orchestrates trip planning with GPT tool-calling.
- Receives trigger/webhook input.
- Calls specialist services via x402 challenge/pay/retry flow.
- Emits SSE stream (`/api/events`) and replay (`/api/replay/:runId`).

### 2. Specialists (`apps/rider`, `apps/foodie`, `apps/eventbot`)
- Expose priced endpoints:
  - Rider: `POST /api/find-rides`
  - Foodie: `POST /api/find-restaurants`
  - EventBot: `POST /api/find-events`, `POST /api/register-event`
- Use provider-kit enforcer pipeline on each priced route.
- Emit thought/browser activity events via SSE hub.

### 3. Gateway (`apps/gateway`)
- Shared enforcement API and operational inspection routes.
- Includes weather/x402 proxy routes and receipt persistence.
- Persists timeline/action/payment state in Postgres via Prisma.

### 4. Web Dashboard (`apps/web`)
- `/` for passport/session controls and timeline inspection.
- `/console` for live multi-agent mission view:
  - browser panels
  - email thread
  - enforcement timeline
  - transaction feed
  - replay controls

### 5. Shared Packages
- `packages/provider-kit`: route enforcement middleware + interfaces.
- `packages/agent-core`: LLM loop, Firecrawl helpers, AgentMail/Pieverse clients, SSE hub.
- `packages/shared-types`: payment headers/protocol types.
- `packages/db`: Prisma schema/client.
- `packages/contracts`: PassportRegistry, SessionRegistry, ReceiptLog.

## Enforcement Pipeline (priced routes)
1. Verify signed envelope identity.
2. Verify nonce replay protection.
3. Verify active delegated session.
4. Verify passport exists / not revoked / not expired.
5. Verify scope allowlist.
6. Verify service allowlist.
7. Verify rate limits.
8. Verify budget caps.
9. Return 402 quote when unpaid.
10. Verify payment proof.
11. Record receipt + timeline and serve response.

## Runtime Topology (local defaults)
- Web: `:3000`
- Gateway: `:4001`
- Rider: `:4002`
- Foodie: `:4003`
- EventBot: `:4004`
- Planner: `:4005`

## Data + Audit
- Policy state lives on-chain (passport/session/receipt contracts).
- Operational traces and replay events live in Postgres (`packages/db/prisma/schema.prisma`).
- Replay endpoint reconstructs event timing using recorded offsets.

## Legacy Compatibility
The repository still contains legacy flows for gateway-centered demos:
- `apps/customer-agent`
- `apps/weather-fallback-provider`
- `apps/runner`

These can be run independently from the TripDesk console workflow.
