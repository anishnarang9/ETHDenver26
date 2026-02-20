# Agent Passport and x402 Commerce Stack (Kite)

A full reference implementation of safe autonomous agent commerce on Kite:

- On-chain passport policy and revocation
- On-chain session delegation
- x402-style 402 challenge/payment/retry flow
- Facilitator-first verification with direct-transfer fallback
- On-chain receipt logging for auditability
- Live timeline dashboard
- Browser-wallet-signed passport/session/revoke writes (no owner private key sent to server)
- Dual pricing profiles (`demo` and low-cost `test`) for repeated validation
- Deterministic runner controls (route selection, iterations, facilitator toggle)
- Gateway KITE spend guard and optional local mock facilitator

## Monorepo Layout
- `apps/web` - Next.js dashboard for passport policy, revocation, and timeline
- `apps/gateway` - Fastify enforcement API and policy middleware integration
- `apps/runner` - Autonomous agent runner script
- `apps/customer-agent` - Standalone external customer agent (owns its own keys)
- `apps/weather-fallback-provider` - Deterministic payable weather API for localhost fallback demos
- `packages/contracts` - Solidity contracts + Hardhat tests/deploy
- `packages/provider-kit` - Reusable Node middleware and route config toolkit
- `packages/shared-types` - Common TypeScript interfaces/constants
- `packages/db` - Prisma schema + DB client
- `docs` - Architecture, runbook, and demo script

## Core Flow
1. Owner creates passport policy for an agent on-chain.
2. Owner grants a short-lived on-chain session key.
3. Agent calls priced route and receives HTTP 402 challenge.
4. Agent pays via facilitator (or direct transfer fallback) and retries.
5. Gateway verifies settlement and logs receipt on-chain.
6. Dashboard renders full event timeline.
7. Owner revokes passport; future actions fail immediately.

## Quick Start
See:
- `docs/setup-and-runbook.md`
- `docs/architecture.md`
- `docs/demo-script.md`
- `docs/real-customer-e2e.md`
- `docs/productization-roadmap.md`
- `docs/frontend-prd.md`
- `docs/realistic-agent-mission-runbook.md`

## Status
This repository contains full scaffolding and implementation code for the balanced MVP+DX build plan, including contract tests and middleware tests. Deploy/testnet credentials and dependency installation are required to run end-to-end.

## License
MIT
