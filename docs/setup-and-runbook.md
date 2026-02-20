# Setup and Runbook

## 1. Prerequisites
- Node.js 20+
- pnpm 9+
- Postgres 14+
- Kite testnet RPC endpoint and testnet USDT

## 2. Install
```bash
pnpm install
```

Optional single-file env model:
```bash
ln -sf ../../.env.master apps/gateway/.env
ln -sf ../../.env.master apps/web/.env.local
ln -sf ../../.env.master apps/weather-fallback-provider/.env
ln -sf ../../.env.master apps/customer-agent/.env
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
# fill required values
pnpm --filter @kite-stack/gateway dev
```

Testing-focused defaults:
- `ROUTE_POLICY_PROFILE=test`
- `TEST_PRICE_ENRICH_ATOMIC=1000`
- `TEST_PRICE_PREMIUM_ATOMIC=5000`
- `TEST_PRICE_WEATHER_KITE_ATOMIC=2000`
- `TEST_PRICE_WEATHER_FALLBACK_ATOMIC=2000`
- `WEATHER_UPSTREAM_URL=https://x402.dev.gokite.ai/api/weather`
- `WEATHER_FALLBACK_BASE_URL=http://localhost:4102`

## 6. Web Dashboard
```bash
cp apps/web/.env.example apps/web/.env.local
pnpm --filter @kite-stack/web dev
```
Open: `http://localhost:3000`

Security model:
- Passport/session/revoke writes are signed directly in the browser wallet.
- Owner private keys are never sent to the gateway.
- Agent/session/payment private keys are never stored in gateway config.

## 7. Weather Fallback Provider
```bash
cp apps/weather-fallback-provider/.env.example apps/weather-fallback-provider/.env
pnpm --filter @kite-stack/weather-fallback-provider dev
```

Required vars:
- `KITE_RPC_URL`
- `WEATHER_FALLBACK_ASSET`
- `WEATHER_FALLBACK_PAY_TO`

## 8. Customer Agent (External Wallet Owner)
```bash
cp apps/customer-agent/.env.example apps/customer-agent/.env
pnpm --filter @kite-stack/customer-agent dev
```

The script prints:
- `agent=<address>` and `session=<address>` for owner onboarding in web.
- `payer=<address>` used for fallback direct transfer.

## 9. Optional Internal Runner
```bash
cp apps/runner/.env.example apps/runner/.env
pnpm --filter @kite-stack/runner dev
```

## 10. Spend Guard
```bash
pnpm test:spend-check
```
This enforces `MAX_KITE_SPEND_PER_DAY` for the gateway signer and stores daily snapshots in `/tmp/kite-stack-spend-YYYY-MM-DD.json`.

## 11. Continuous Validation
```bash
pnpm -r test
pnpm -r typecheck
pnpm -r build
```

## Real-Customer Demo Checklist
1. Start 4 processes: gateway, web, fallback-provider, customer-agent.
2. Connect owner wallet in web and paste customer agent/session addresses.
3. Upsert passport and grant session.
4. Re-run customer-agent.
5. Confirm primary `/api/weather-kite` attempt occurs.
6. Confirm fallback `/api/weather-fallback` pays and returns 200.
7. Verify evidence in `/api/actions/:actionId` and `/api/timeline/:agent`.
8. Revoke passport and re-run customer-agent to confirm immediate block.
