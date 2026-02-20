# Setup and Runbook

## 1. Prerequisites
- Node.js 20+
- pnpm 9+
- Postgres 14+
- Kite testnet RPC endpoint

## 2. Install
```bash
pnpm install
```

## 3. Database
```bash
cp packages/db/.env.example packages/db/.env # create if needed
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/kite_stack
pnpm db:generate
pnpm db:migrate
```

## 4. Contracts
```bash
cp packages/contracts/.env.example packages/contracts/.env
# fill RPC + key vars
pnpm --filter @kite-stack/contracts deploy:kite-testnet
```
Capture deployed addresses for:
- `PASSPORT_REGISTRY_ADDRESS`
- `SESSION_REGISTRY_ADDRESS`
- `RECEIPT_LOG_ADDRESS`

## 5. Gateway
```bash
cp apps/gateway/.env.example apps/gateway/.env
# fill all required values
pnpm --filter @kite-stack/gateway dev
```

Testing-focused gateway defaults:
- `ROUTE_POLICY_PROFILE=test`
- `TEST_PRICE_ENRICH_ATOMIC=1000`
- `TEST_PRICE_PREMIUM_ATOMIC=5000`
- `MAX_KITE_SPEND_PER_DAY=0.05`

## 6. Web Dashboard
```bash
cp apps/web/.env.example apps/web/.env.local
# set NEXT_PUBLIC_PASSPORT_REGISTRY_ADDRESS and NEXT_PUBLIC_SESSION_REGISTRY_ADDRESS
pnpm --filter @kite-stack/web dev
```
Open: `http://localhost:3000`

Security model:
- Passport/session/revoke writes are signed directly in the browser wallet.
- Owner private keys are never sent to the gateway.

## 7. Runner
```bash
cp apps/runner/.env.example apps/runner/.env
# fill keys and gateway URL
pnpm --filter @kite-stack/runner dev
```

Cost-safe runner controls:
- `RUNNER_ROUTES=enrich-wallet` for repeated rounds.
- `RUNNER_ITERATIONS=20` (or desired loop count).
- `RUNNER_DISABLE_FACILITATOR=true` to force direct-transfer path testing.

## 8. Mock Facilitator (Local/Low-Spend)
```bash
pnpm dev:facilitator-mock
```
Set:
- `FACILITATOR_URL=http://localhost:4100` in gateway and runner envs.

## 9. Spend Guard
```bash
pnpm test:spend-check
```
This command enforces `MAX_KITE_SPEND_PER_DAY` for the gateway signer and stores daily snapshots in `/tmp/kite-stack-spend-YYYY-MM-DD.json`.

## 10. Continuous Validation
```bash
pnpm -r test
pnpm -r typecheck
pnpm -r build
```

## Demo Flow Checklist
1. Upsert passport from web panel.
2. Grant session key.
3. Run runner.
4. Observe 402 issuance then payment verification.
5. Verify receipt event and on-chain tx hash.
6. Revoke passport and rerun runner to show immediate block.

## Negative Tests
- Scope violation: call premium route with missing scope.
- Rate limit: rapid repeated calls on same route.
- Replay: resend same nonce.
- Overspend: lower daily cap below route price.
- Invalid proof: wrong actionId with old tx hash.
