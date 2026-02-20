# Realistic Agent Mission Runbook (Solo Owner)

Date: February 20, 2026  
Goal: run a real agent with passport + guardrails, execute a two-API mission, pay per action, and prove robustness.

## 1) Mission definition

Mission name: `Dual-Intel Scout`

Agent behavior:
1. Call API A (Kite-native).
2. Call API B (generic x402).
3. If both succeed and policy allows, execute a final on-chain transaction.
4. Persist full evidence (actionId -> payment -> receipt -> tx links).

Guardrails to enforce:
1. Scope allowlist.
2. Service allowlist.
3. Per-call cap.
4. Daily cap.
5. Rate limit.
6. Session expiry.
7. Revocation.

## 2) API model for this mission

Rule: **all calls go through our gateway**.

API A (Kite-native target):
1. Use Kite-documented weather endpoint behind a gateway connector.
2. Keep this as the “Kite-native integration” leg of the mission.

API B (generic x402 target):
1. Use a pure x402 provider connector behind the same gateway.
2. Recommended for deterministic testing: run your own generic x402 provider service first.
3. Optional later: switch this connector to a third-party x402 provider.

Reason:
1. Gateway-only path preserves your core value: policy enforcement + auditability.
2. Direct external calls bypass controls and should be disabled in production mode.

## 3) What to run now vs what to add

## Track N0 (run today with existing code)

Use existing priced routes to validate your stack end-to-end:
1. `POST /api/enrich-wallet`
2. `POST /api/premium-intel`

This proves:
1. passport/session policy checks,
2. 402 challenge flow,
3. payment verification,
4. on-chain receipt logging,
5. revocation and abuse controls.

## Track N1 (full realistic two-API mission)

Add mission routes and adapter layer:
1. `/api/mission/kite-native`
2. `/api/mission/x402-generic`
3. `/api/mission/commit-tx`

Add runner mission orchestration:
1. route sequence execution,
2. policy-aware stop conditions,
3. final transaction leg.

## 4) Step-by-step execution plan

## Phase A: Preflight and baseline

1. Install and validate workspace.

```bash
cd /Users/anishnarang/ETHDenver26
pnpm install
pnpm -r typecheck
pnpm -r test
pnpm -r build
```

2. Start database and migrate.

```bash
pnpm db:generate
pnpm db:migrate
```

3. Run spend guard baseline before paid runs.

```bash
pnpm --filter @kite-stack/gateway test:spend-check
```

## Phase B: Wallet and contract readiness

Use separate wallets:
1. owner wallet,
2. agent wallet,
3. session wallet,
4. payment wallet,
5. gateway signer wallet.

Checklist:
1. payment wallet funded with test payment asset + KITE gas.
2. gateway signer has KITE gas.
3. deployed addresses set in env:
   - `PASSPORT_REGISTRY_ADDRESS`
   - `SESSION_REGISTRY_ADDRESS`
   - `RECEIPT_LOG_ADDRESS`
4. `RECEIPT_LOG` has gateway role granted.

## Phase C: Start apps

1. Start gateway.

```bash
pnpm --filter @kite-stack/gateway dev
```

2. Start web.

```bash
pnpm --filter @kite-stack/web dev
```

3. Confirm health.

```bash
curl -sS http://localhost:4001/health
```

## Phase D: Create real agent and passport

In web UI:
1. Connect owner wallet.
2. Set agent address.
3. Configure guardrails:
   - scopes: `enrich.wallet,premium.intel`
   - services: `internal.enrich,external.premium`
   - per-call cap and daily cap with realistic values
   - expiry window
4. Upsert passport on-chain.
5. Grant session key on-chain.

Validation:
1. `GET /api/passport/:agent` shows active passport.
2. session appears active for agent.

## Phase E: Run Track N0 (today, robust baseline)

1. Configure runner for deterministic low-cost loop.

```bash
export RUNNER_ROUTES=enrich-wallet,premium-intel
export RUNNER_ITERATIONS=1
pnpm --filter @kite-stack/runner dev
```

2. Validate timeline evidence:
1. `IDENTITY_VERIFIED`
2. `PAYMENT_REQUIRED_402`
3. `PAYMENT_VERIFIED`
4. `RECEIPT_RECORDED`
5. `RESPONSE_SERVED`

3. Re-run spend check.

```bash
pnpm --filter @kite-stack/gateway test:spend-check
```

## Phase F: Add Track N1 (two-API realistic mission)

Implementation tasks:
1. Add mission route policies with dedicated scopes:
   - `mission.kite-native`
   - `mission.x402-generic`
   - `mission.commit`
2. Implement upstream connector interface in gateway:
   - `createChallenge`
   - `verifyOrSettle`
   - `normalizeResult`
3. Implement connectors:
   - `KiteNativeConnector`
   - `GenericX402Connector`
4. Add mission commit route:
   - final transaction from payment or agent wallet with safe amount.
   - write transaction reference into action timeline metadata.
5. Extend runner route parser to include mission routes and sequence runner.

## Phase G: Robustness test matrix (required)

Run these tests and capture outputs:

1. Happy path dual-API mission succeeds.
2. Scope mismatch returns 403 before payment.
3. Service mismatch returns 403 before payment.
4. Nonce replay returns 409.
5. Rate limit breach returns 429.
6. Per-call cap breach blocks pre-payment.
7. Daily cap breach blocks pre-payment.
8. Session expired returns 401.
9. Session revoked returns 401.
10. Passport revoked blocks immediate next call.
11. Wrong proof amount rejected.
12. Wrong proof recipient rejected.
13. Wrong actionId rejected.
14. Facilitator failure triggers fallback path where configured.
15. Final commit transaction records successfully and is visible in explorer.

## Phase H: Evidence package after each run

Collect:
1. agent address and session address.
2. action IDs for each mission step.
3. payment verification mode and references.
4. settlement tx hashes.
5. receipt tx hashes.
6. timeline screenshot showing sequence.
7. one failure screenshot per major guardrail.

## 5) x402 compatibility plan (supporting “all types” pragmatically)

Support in phases:

Phase 1 (must):
1. x402 v1 `X-PAYMENT`.
2. x402 v2 `PAYMENT-*`.
3. direct tx proof fallback.

Phase 2 (must for Kite-native ecosystem):
1. `gokite-aa` adapter path.
2. scheme-specific validation and settlement integration.

Phase 3 (nice to have):
1. provider capability discovery and auto-adapter selection.
2. compatibility cache and health scoring per provider.

Note from live probe on February 20, 2026:
1. `https://x402.dev.gokite.ai/api/weather` returns valid 402 challenge.
2. facilitator verify/settle with `gokite-aa + kite-testnet` returned:
   - `No facilitator registered for scheme: gokite-aa and network: kite-testnet`.
3. Treat this as external integration risk and keep internal path as canonical demo until connector compatibility is confirmed.

## 6) Productionization checklist (beyond localhost)

## Containerization

1. Dockerfile for `apps/web`.
2. Dockerfile for `apps/gateway`.
3. Dockerfile for `apps/runner`.
4. Compose stack for local-prod parity:
   - web
   - gateway
   - runner worker
   - postgres
   - redis

## Deployment

1. Frontend on Vercel.
2. Gateway and runner on container host (ECS/Cloud Run/Render/Fly).
3. Managed Postgres.
4. Managed Redis.

## Security and reliability

1. Secret manager for private keys and API credentials.
2. No secrets in git, image layers, or client bundles.
3. TLS everywhere.
4. Structured logs, metrics, tracing.
5. Alerting on payment verification failure rate and gateway health.
6. Nightly synthetic mission run.

## 7) Go/No-Go criteria

Go when all are true:
1. Dual-API mission passes end-to-end via gateway-only model.
2. All critical guardrail negative tests pass.
3. Evidence mapping for every paid action is complete.
4. Revocation cuts off next call immediately.
5. Public deployment is reachable and reproducible via README.

No-go if any are true:
1. agent can bypass gateway in production mode.
2. payment verification gaps allow unpriced success.
3. receipt log mapping is incomplete for paid actions.
4. critical negative tests are flaky or failing.
