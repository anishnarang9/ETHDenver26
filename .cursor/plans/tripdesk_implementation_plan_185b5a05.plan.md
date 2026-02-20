---
name: TripDesk Implementation Plan
overview: "Complete implementation plan for TripDesk: 4 new apps (planner, rider, foodie, eventbot), shared LLM+Firecrawl framework, enhanced dashboard, SSE event hub with replay, AgentMail integration, Pieverse v2 -- all built on top of the existing provider-kit, payment flow, contracts, and shared types."
todos:
  - id: agent-core
    content: Create packages/agent-core/ with llm.ts (OpenAI function calling loop), browser.ts (Firecrawl session manager), agentmail.ts (REST client), pieverse.ts (v2 settle/verify), sse-emitter.ts (SSE hub + DB recording)
    status: pending
  - id: rider
    content: Create apps/rider/ -- Fastify + provider-kit enforcement + GPT-4o-mini LLM handler with Firecrawl browser for Google Maps / ride estimation. POST /api/find-rides gated at 0.50 tokens
    status: pending
  - id: foodie
    content: Create apps/foodie/ -- same pattern as Rider, GPT-4o-mini for Yelp/Google Maps restaurant search. POST /api/find-restaurants gated at 1.0 token
    status: pending
  - id: eventbot
    content: "Create apps/eventbot/ -- GPT-4o (full model) for Luma event search + form-filling registration. TWO endpoints: POST /api/find-events (0.50) and POST /api/register-event (1.0). Test on real Luma events"
    status: pending
  - id: planner
    content: Create apps/planner/ -- GPT-4o orchestrator with function calling tools (get_weather via Pieverse, hire_rider/foodie/eventbot via callPricedRoute, email_agent/email_human via AgentMail). SSE endpoint at GET /api/events, replay at GET /api/replay/:runId
    status: pending
  - id: dashboard
    content: "Overhaul apps/web/ -- add Tailwind + shadcn + framer-motion. Build /console page with: 3 AgentBrowserPanels (Firecrawl iframes + thought bubbles), EmailThread, EnforcementPipeline (10-step animated), WalletBalances (live polling), TransactionFeed (Kitescan links), MissionControl (revoke/trigger buttons), ReplayButton"
    status: pending
  - id: sse-replay
    content: Add RunEvent model to Prisma schema, SSEHub records all events with offsetMs. Planner GET /api/replay/:runId streams recorded events with original timing delays
    status: pending
  - id: agentmail
    content: Create 4 AgentMail inboxes at startup, webhook on Planner for message.received, agent-to-agent email coordination, itinerary delivery to human Gmail
    status: pending
  - id: failure-demos
    content: "3 dashboard buttons: Run Additional Search (budget cap at step 8), Trigger Scope Violation (shopping blocked at step 5), Revoke EventBot (passport revoked at step 4). Each shows pipeline animation + agent email notification"
    status: pending
  - id: deploy
    content: Dockerfiles for all 4 services, deploy to Railway (Fastify on 0.0.0.0), Vercel for dashboard, .env.example files, setup wizard (fund wallets + deploy passports + create inboxes), README, demo video via replay mode
    status: pending
isProject: false
---

# TripDesk: Complete Implementation Plan

## What Already Exists (DO NOT rebuild)

The codebase has a mature foundation. Every item below is complete and production-ready:

- **Payment flow**: `callPricedRoute()` in [apps/runner/src/flow.ts](apps/runner/src/flow.ts), `payDirectTransfer()` and `payViaFacilitator()` in [apps/runner/src/payment.ts](apps/runner/src/payment.ts), `signEnvelope()` in [apps/runner/src/signing.ts](apps/runner/src/signing.ts)
- **Enforcement middleware**: `createRouteEnforcer()` in [packages/provider-kit/src/enforcement.ts](packages/provider-kit/src/enforcement.ts) -- the full 10-step pipeline with all interfaces (`PassportClient`, `SessionClient`, `QuoteStore`, `PaymentService`, `NonceStore`, `BudgetService`, `RateLimiter`, `ReceiptWriter`, `EventSink`, `SignatureVerifier`)
- **In-memory implementations**: All interfaces have in-memory versions in [packages/provider-kit/src/inmemory.ts](packages/provider-kit/src/inmemory.ts) (useful for specialist agents that don't need Postgres)
- **Payment verification**: `KitePaymentService` in [apps/gateway/src/payment.ts](apps/gateway/src/payment.ts) with dual-mode verify (facilitator + direct transfer)
- **Contract clients**: `OnchainPassportClient`, `OnchainSessionClient`, `OnchainReceiptWriter` in [apps/gateway/src/contracts.ts](apps/gateway/src/contracts.ts)
- **Storage**: `PrismaQuoteStore`, `PrismaNonceStore`, `PrismaBudgetService`, `PrismaEventSink`, `PrismaReceiptWriter` in [apps/gateway/src/storage.ts](apps/gateway/src/storage.ts)
- **Types**: All payment, envelope, event, and error types in [packages/shared-types/src/](packages/shared-types/src/)
- **Header parsing**: `readEnvelope()`, `readPaymentProof()`, `buildChallengeHeaders()` in [packages/provider-kit/src/headers.ts](packages/provider-kit/src/headers.ts)
- **Solidity contracts**: `PassportRegistry.sol`, `SessionRegistry.sol`, `ReceiptLog.sol` in [packages/contracts/contracts/](packages/contracts/contracts/)
- **DB schema**: Full Prisma schema in [packages/db/prisma/schema.prisma](packages/db/prisma/schema.prisma) (Agent, PassportSnapshot, Session, ActionAttempt, PaymentQuote, PaymentSettlement, Receipt, EnforcementEvent, Nonce)
- **Web utilities**: `upsertPassportOnchain()`, `revokePassportOnchain()`, `grantSessionOnchain()` in [apps/web/src/lib/onchain.ts](apps/web/src/lib/onchain.ts); API client in [apps/web/src/lib/api.ts](apps/web/src/lib/api.ts)
- **Existing SSE**: Basic timeline stream at `GET /api/timeline/:agent/stream` in [apps/gateway/src/operationalRoutes.ts](apps/gateway/src/operationalRoutes.ts)
- **Route policies**: `getRoutePolicies()` in [packages/provider-kit/src/routeConfig.ts](packages/provider-kit/src/routeConfig.ts)

## What Needs to Be Built

### External APIs We Integrate With

| API              | Auth                                      | Key Endpoints                                                                                                            | SDK                                   |
| ---------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| **OpenAI**       | `OPENAI_API_KEY` header                   | `POST /v1/chat/completions` (function calling)                                                                           | `openai` npm package                  |
| **Firecrawl**    | `Authorization: Bearer FIRECRAWL_API_KEY` | `POST /v2/browser` (create session), `POST /v2/browser/{id}/execute` (run Playwright), `GET /v2/browser` (list sessions) | `@mendable/firecrawl-js` or raw fetch |
| **AgentMail**    | `Authorization: Bearer AGENTMAIL_API_KEY` | `POST /v0/inboxes` (create), `POST /v0/messages` (send), `GET /v0/threads` (list), `POST /v0/webhooks` (create webhook)  | raw fetch                             |
| **Pieverse**     | None (public)                             | `POST /v2/verify`, `POST /v2/settle`                                                                                     | raw fetch                             |
| **Kite Weather** | x402 payment via `X-Payment` header       | `GET /api/weather?location=...`                                                                                          | raw fetch                             |
| **Kite RPC**     | None                                      | `https://rpc-testnet.gokite.ai/`                                                                                         | `ethers.JsonRpcProvider`              |

---

## New Packages and Apps

### 1. `packages/agent-core/` -- Shared LLM + Firecrawl Framework

A new package that every specialist agent imports. Contains:

`**src/llm.ts**` -- OpenAI wrapper with streaming thought output

```typescript
import OpenAI from "openai";

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface LLMCallResult {
  thoughts: string[]; // streamed reasoning chunks
  toolCalls: Array<{
    name: string;
    args: Record<string, unknown>;
    result: unknown;
  }>;
  finalAnswer: string;
}

export async function runAgentLoop(opts: {
  model: "gpt-4o" | "gpt-4o-mini";
  systemPrompt: string;
  userMessage: string;
  tools: AgentTool[];
  onThought: (text: string) => void; // SSE callback
  onToolCall: (name: string, args: unknown) => void; // SSE callback
  maxIterations?: number;
}): Promise<LLMCallResult>;
```

Uses OpenAI function calling in a loop: call LLM -> get tool_calls -> execute tools -> feed results back -> repeat until LLM returns final text response. Every reasoning chunk calls `onThought()` for SSE streaming.

`**src/browser.ts**` -- Firecrawl browser session manager

```typescript
export interface BrowserSession {
  id: string;
  liveViewUrl: string;
  cdpUrl: string;
  expiresAt: string;
}

export async function createBrowserSession(opts: {
  apiKey: string;
  ttl?: number;
}): Promise<BrowserSession>;

export async function executeBrowserCode(opts: {
  apiKey: string;
  sessionId: string;
  code: string; // Playwright code to execute
}): Promise<{ output: string; screenshot?: string }>;

export async function closeBrowserSession(opts: {
  apiKey: string;
  sessionId: string;
}): Promise<void>;
```

Wraps Firecrawl's `POST /v2/browser`, `POST /v2/browser/{id}/execute`, and `DELETE /v2/browser/{id}`.

`**src/sse-emitter.ts**` -- SSE event emitter shared by all agents

```typescript
export interface SSEEvent {
  type: string; // email_received, llm_thinking, browser_session, enforcement_step, etc.
  agentId: string;
  payload: Record<string, unknown>;
}

export class SSEHub {
  private clients: Set<Response>;
  private runId: string;
  private runStart: number;
  private dbWriter?: (event: RunEvent) => Promise<void>; // Prisma write for replay

  addClient(res: Response): void;
  removeClient(res: Response): void;
  emit(event: SSEEvent): void; // broadcasts to all clients + writes to DB
}
```

Single SSE hub that ALL agents push events to. The dashboard connects to one `GET /api/events` endpoint on the Planner service, and the Planner hub aggregates events from specialist agents via HTTP POST callbacks.

`**src/agentmail.ts**` -- AgentMail client

```typescript
export interface AgentMailClient {
  createInbox(username: string): Promise<{ address: string; id: string }>;
  sendMessage(opts: {
    from: string;
    to: string;
    subject: string;
    body: string;
    inReplyTo?: string;
  }): Promise<{ messageId: string; threadId: string }>;
  listThreads(inboxId: string): Promise<Thread[]>;
  createWebhook(opts: {
    url: string;
    inboxId: string;
    events: string[];
  }): Promise<{ webhookId: string }>;
}

export function createAgentMailClient(apiKey: string): AgentMailClient;
```

Wraps AgentMail REST API (`POST /v0/inboxes`, `POST /v0/messages`, `GET /v0/threads`, `POST /v0/webhooks`).

`**src/pieverse.ts**` -- Pieverse v2 facilitator client

```typescript
export async function settleViaPieverse(opts: {
  authorization: unknown; // signed TransferWithAuthorization payload
  signature: string;
  network: "kite-testnet";
}): Promise<{ txHash: string; settled: boolean }>;

export async function verifyViaPieverse(opts: {
  authorization: unknown;
  signature: string;
  network: "kite-testnet";
}): Promise<{ valid: boolean; reason?: string }>;
```

Calls `facilitator.pieverse.io/v2/settle` and `/v2/verify`. Different from the existing `payViaFacilitator()` which uses the older `/pay` endpoint.

**Package deps**: `openai`, `ethers`, `@kite-stack/shared-types`

---

### 2. `apps/rider/` -- Rider Specialist Agent

Fastify server with provider-kit enforcement. One x402-gated endpoint.

`**src/server.ts**`:

- Fastify + CORS
- Route: `POST /api/find-rides` -- config: `{ routeId: "find-rides", scope: "transport", service: "rider", priceAtomic: "500000000000000000", requirePayment: true }`
- `GET /health`
- Provider-kit enforcement via `createRouteEnforcer()` (same pattern as gateway)
- Uses in-memory implementations from `packages/provider-kit/src/inmemory.ts` for quote/nonce/budget stores, but ON-CHAIN passport/session clients from `apps/gateway/src/contracts.ts` pattern

`**src/handler.ts**` -- The LLM-powered ride search:

```typescript
export async function handleFindRides(opts: {
  origin: string;
  destination: string;
  date: string;
  preferences?: string;
  sseHub: SSEHub;
}): Promise<RideResults> {
  // 1. Create Firecrawl browser session -> emit browser_session event with liveViewUrl
  // 2. Run LLM agent loop with tools:
  //    - navigate(url) -> executes Playwright page.goto()
  //    - search(query) -> types into search fields
  //    - screenshot() -> captures current page
  //    - extract_data(selector) -> extracts text from elements
  // 3. LLM decides: "Search Google Maps for distance first, then check ride prices"
  // 4. Each LLM thought -> emit llm_thinking event
  // 5. Return structured { rides: [...], liveViewUrl, screenshots: [...] }
}
```

**LLM system prompt**: "You are a transportation research agent. Given origin, destination, and date, use the browser to find ride options. Start with Google Maps to check distance and travel time. Then search ride estimation sites for price quotes. Evaluate if public transit is viable based on distance. Return structured results with ride type, estimated price, and travel time."

**Config**: `OPENAI_API_KEY`, `FIRECRAWL_API_KEY`, `KITE_RPC_URL`, `PAYMENT_ASSET`, `AGENT_PRIVATE_KEY`, `PORT`

---

### 3. `apps/foodie/` -- Foodie Specialist Agent

Same structure as Rider. One x402-gated endpoint.

**Route**: `POST /api/find-restaurants` -- price: 1.0 token, scope: "food", service: "foodie"

**Handler**: LLM agent with browser tools. System prompt focuses on restaurant search via Yelp/Google Maps, considering weather data (passed as context from Planner), ratings, price range, distance, hours.

---

### 4. `apps/eventbot/` -- EventBot Specialist Agent

Same Fastify + provider-kit structure. TWO x402-gated endpoints.

**Routes**:

- `POST /api/find-events` -- price: 0.50 token, scope: "events", service: "eventbot"
- `POST /api/register-event` -- price: 1.0 token, scope: "events", service: "eventbot"

**Handler for find-events**: LLM browses lu.ma, searches for events matching interests/dates, extracts details.

**Handler for register-event**: LLM navigates to specific event URL, finds registration form, fills name+email fields, clicks submit, takes confirmation screenshot. This is the most complex handler -- needs GPT-4o (not mini) for reliable form interaction.

---

### 5. `apps/planner/` -- Planner Orchestrator

The central brain. NOT a provider-kit-gated service (it's the CLIENT, not a service provider).

`**src/server.ts**`:

- Fastify + CORS
- `POST /api/webhook/email` -- AgentMail webhook receiver (incoming human emails)
- `POST /api/trigger` -- manual trigger from dashboard (for demo button)
- `GET /api/events` -- SSE endpoint (dashboard connects here)
- `GET /api/replay/:runId` -- SSE replay endpoint
- `GET /health`

`**src/orchestrator.ts**` -- The GPT-4o orchestrator:

```typescript
export async function runTripPlan(opts: {
  humanEmail: { from: string; subject: string; body: string };
  sseHub: SSEHub;
  agentMailClient: AgentMailClient;
  config: PlannerConfig;
}): Promise<void> {
  // Uses runAgentLoop from agent-core with these tools:

  const tools: AgentTool[] = [
    {
      name: "get_weather",
      description:
        "Get weather for a location via Kite Weather API (x402, Pieverse facilitator)",
      execute: async ({ location }) => {
        // 1. Call x402.dev.gokite.ai/api/weather?location=...
        // 2. Get 402 -> settle via Pieverse -> retry with X-Payment
        // 3. Emit payment_start, payment_complete events
        // Return weather data
      },
    },
    {
      name: "hire_rider",
      description: "Hire the Rider agent to search for transportation options",
      execute: async ({ origin, destination, date, preferences }) => {
        // 1. Call POST rider.up.railway.app/api/find-rides via callPricedRoute()
        // 2. This triggers 402 -> direct ERC20 transfer -> retry with proof
        // 3. Emit enforcement_step events as they come back
        // 4. Emit browser_session event with liveViewUrl from response
        // Return ride options
      },
    },
    {
      name: "hire_foodie",
      // Same pattern as hire_rider but calling foodie endpoint
    },
    {
      name: "hire_eventbot",
      // Calls eventbot/api/find-events
    },
    {
      name: "register_event",
      // Calls eventbot/api/register-event
    },
    {
      name: "email_agent",
      description: "Send email to a specialist agent for coordination",
      execute: async ({ to, subject, body }) => {
        // Uses AgentMail API to send email
        // Emit email_sent event
      },
    },
    {
      name: "email_human",
      description: "Send the final itinerary email to the human",
      execute: async ({ to, subject, body }) => {
        // Uses AgentMail API
        // Emit email_sent event
      },
    },
  ];
}
```

**Key reuse from existing code**:

- `callPricedRoute()` from [apps/runner/src/flow.ts](apps/runner/src/flow.ts) -- adapted to call specialist URLs instead of gateway
- `payDirectTransfer()` from [apps/runner/src/payment.ts](apps/runner/src/payment.ts) -- for agent-to-agent payments
- `signEnvelope()` from [apps/runner/src/signing.ts](apps/runner/src/signing.ts) -- sign requests to specialists
- `buildBodyHash()` from [apps/runner/src/signing.ts](apps/runner/src/signing.ts)

The Planner needs its own wallet (funded with 10 tokens), its own agent private key, and its own session key. These are configured via env vars, same pattern as the runner's config.

---

### 6. `apps/web/` -- Dashboard Overhaul

Replace the current basic dashboard with the full TripDesk console. Keep existing utilities (`lib/onchain.ts`, `lib/api.ts`).

**New dependencies**: `tailwindcss`, `@shadcn/ui` components, `framer-motion`, `lucide-react`

**New pages**:

- `/console` -- main demo dashboard (the big layout)
- `/` -- landing page with setup wizard

**New components** (all in `src/components/`):

| Component                  | What It Renders                                                                               | Data Source                                           |
| -------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `console-layout.tsx`       | CSS grid: 3 browser panels top, email+pipeline left-bottom, mission-control right-bottom      | Composes all below                                    |
| `agent-browser-panel.tsx`  | Agent avatar + status + Firecrawl `liveViewUrl` iframe + thought bubble                       | SSE `browser_session`, `llm_thinking`                 |
| `thought-bubble.tsx`       | Streaming text that shows LLM reasoning                                                       | SSE `llm_thinking` events                             |
| `email-thread.tsx`         | Scrollable message list with agent avatars and timestamps                                     | SSE `email_sent`, `email_received`                    |
| `enforcement-pipeline.tsx` | 10-step horizontal bar, each step animates green (pass) or red (fail) with framer-motion      | SSE `enforcement_step`                                |
| `wallet-balances.tsx`      | 4 agent wallet cards with animated token counters, polling `balanceOf` on Kite RPC            | SSE `wallet_update` + direct RPC polling              |
| `transaction-feed.tsx`     | Card list of x402 transactions with Pieverse/Direct badges and Kitescan links                 | SSE `payment_complete`, `payment_failed`              |
| `mission-control.tsx`      | Container for wallets + transactions + action buttons (revoke, trigger scope violation, etc.) | Composes wallet-balances + transaction-feed + buttons |
| `replay-button.tsx`        | Button that disconnects current SSE and reconnects to `/api/replay/:runId`                    | Switches SSE source                                   |

**New hooks** (in `src/hooks/`):

| Hook                    | Purpose                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| `use-sse.ts`            | `useSSE(url)` -- connects to EventSource, dispatches events to a React context/reducer, handles reconnection |
| `use-wallet-balance.ts` | `useWalletBalance(address)` -- polls ERC20 `balanceOf` on Kite RPC every 5s, returns animated value          |

**New lib** (in `src/lib/`):

| File              | Purpose                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `sse-context.tsx` | React context that holds all SSE state (emails, browser sessions, enforcement steps, payments, thoughts) and provides typed selectors |
| `kite-rpc.ts`     | Ethers provider for Kite testnet RPC, ERC20 `balanceOf` helper                                                                        |

---

### 7. Schema Extension

Add to [packages/db/prisma/schema.prisma](packages/db/prisma/schema.prisma):

```prisma
model RunEvent {
  id       String @id @default(uuid())
  runId    String
  offsetMs Int
  type     String
  agentId  String
  payload  Json
  @@index([runId, offsetMs])
}
```

Run `pnpm db:migrate` after adding.

---

## Detailed Build Sequence

### Phase 1: Shared Framework (`packages/agent-core/`) -- ~3h

1. Create `packages/agent-core/package.json` with deps: `openai`, `ethers`, `@kite-stack/shared-types`
2. Add to pnpm workspace
3. Implement `src/llm.ts` -- OpenAI function calling loop with streaming thoughts
4. Implement `src/browser.ts` -- Firecrawl session create/execute/close
5. Implement `src/agentmail.ts` -- AgentMail REST client
6. Implement `src/pieverse.ts` -- Pieverse v2 settle/verify
7. Implement `src/sse-emitter.ts` -- SSE hub with DB recording
8. Export everything from `src/index.ts`

### Phase 2: First Specialist -- Rider (`apps/rider/`) -- ~3h

1. Create `apps/rider/` with Fastify server, copying patterns from [apps/gateway/src/server.ts](apps/gateway/src/server.ts)
2. Wire `createRouteEnforcer()` with on-chain passport/session clients (copy `createContractClients()` pattern from [apps/gateway/src/contracts.ts](apps/gateway/src/contracts.ts))
3. Use `InMemoryQuoteStore`, `InMemoryNonceStore`, `InMemoryBudgetService` from provider-kit (simpler than Postgres for specialist agents)
4. Implement ride search handler using `runAgentLoop()` + `createBrowserSession()`
5. Define LLM tools: `navigate`, `type_text`, `click`, `screenshot`, `extract_text`
6. Test locally: call endpoint without payment headers -> expect 402; call with mock payment -> expect ride results
7. Verify Firecrawl `liveViewUrl` is returned and iframe-embeddable

### Phase 3: Foodie + EventBot (`apps/foodie/`, `apps/eventbot/`) -- ~5h

1. Foodie: clone Rider pattern, change system prompt and route policy (scope: food, price: 1.0)
2. EventBot: clone Rider pattern, TWO endpoints, GPT-4o model (not mini)
3. EventBot register handler: LLM navigates to Luma event URL, identifies form, fills fields, submits
4. Test Luma registration on 2-3 pre-scouted events
5. Verify all three specialists work independently with mock payment headers

### Phase 4: Planner Orchestrator (`apps/planner/`) -- ~4h

1. Create Fastify server with AgentMail webhook endpoint
2. Implement `runTripPlan()` using `runAgentLoop()` with GPT-4o
3. Define tools: `get_weather`, `hire_rider`, `hire_foodie`, `hire_eventbot`, `register_event`, `email_agent`, `email_human`
4. `get_weather` tool: call Kite Weather API, handle 402, settle via Pieverse v2
5. `hire_*` tools: adapt `callPricedRoute()` from runner to call specialist URLs with direct ERC20 transfer
6. SSE hub: aggregate events from own tools + specialist callback events
7. `GET /api/events` SSE endpoint for dashboard
8. `GET /api/replay/:runId` replay endpoint
9. Test end-to-end: trigger Planner manually -> watch it call Weather -> hire specialists -> compile itinerary

### Phase 5: Dashboard UI (`apps/web/`) -- ~5h

1. Install Tailwind CSS, shadcn/ui, framer-motion, lucide-react
2. Create `use-sse.ts` hook and SSE context
3. Build `console-layout.tsx` with CSS grid
4. Build `agent-browser-panel.tsx` with iframe for `liveViewUrl`
5. Build `thought-bubble.tsx` with streaming text
6. Build `email-thread.tsx` with scrollable messages
7. Build `enforcement-pipeline.tsx` with 10-step framer-motion animation
8. Build `wallet-balances.tsx` with ERC20 polling and animated counters
9. Build `transaction-feed.tsx` with Kitescan links and Pieverse/Direct badges
10. Build `mission-control.tsx` composing wallets + txns + action buttons (Revoke, Trigger Scope Violation, Run Additional Search)
11. Build `replay-button.tsx`
12. Wire `/console` page to SSE context

### Phase 6: SSE + Replay System -- ~2h

1. Add `RunEvent` model to Prisma schema, run migration
2. SSEHub `emit()` writes to RunEvent table with `offsetMs`
3. Planner `/api/replay/:runId` reads RunEvent rows ordered by offsetMs, streams with setTimeout delays
4. Dashboard `replay-button.tsx` disconnects live SSE, reconnects to replay URL
5. For browser panels during replay: show stored screenshots instead of live iframes

### Phase 7: AgentMail Integration -- ~2h

1. Create 4 inboxes at startup via `createAgentMailClient().createInbox()`
2. Create webhook on Planner inbox for `message.received` events pointing to `POST planner.up.railway.app/api/webhook/email`
3. Implement email sending in Planner tools (`email_agent`, `email_human`)
4. Specialist agents email results back to Planner after completing work
5. Dashboard `email-thread.tsx` renders all email events

### Phase 8: Failure Demo Buttons -- ~2h

1. Dashboard button: "Run Additional Search" -> `POST /api/trigger` with body `{ action: "additional-search" }` -> Planner tries to hire Rider again -> hits daily budget cap -> pipeline goes red at step 8
2. Dashboard button: "Trigger Scope Violation" -> `POST /api/trigger` with body `{ action: "scope-violation" }` -> Planner sends email requesting shopping -> tries with scope "shopping" -> blocked at step 5
3. Dashboard button: "Revoke EventBot" -> calls `revokePassportOnchain()` from [apps/web/src/lib/onchain.ts](apps/web/src/lib/onchain.ts) -> then `POST /api/trigger` with body `{ action: "post-revoke-test" }` -> EventBot blocked at step 4

Each failure: the enforcement pipeline SSE events show steps going green then stopping at the failed step with red animation. The Planner LLM receives the error, reasons about it, and emails the human.

### Phase 9: Deploy + Polish -- ~4h

1. Each app gets a `Dockerfile` (Node 20 alpine, build TypeScript, run dist)
2. Fastify servers bind to `0.0.0.0` (host) on `PORT` env var (Railway sets this)
3. Deploy Postgres addon on Railway
4. Deploy 4 services to Railway from monorepo (`apps/planner`, `apps/rider`, `apps/foodie`, `apps/eventbot`)
5. Deploy dashboard to Vercel (`apps/web`)
6. Set env vars on each service: `OPENAI_API_KEY`, `FIRECRAWL_API_KEY`, `AGENTMAIL_API_KEY`, `KITE_RPC_URL`, `PAYMENT_ASSET`, agent private keys, service URLs
7. Create `.env.example` for each app
8. Landing page with setup wizard: fund wallets (faucet link), deploy passports (uses onchain.ts), create inboxes, readiness check (ping all services)
9. README with architecture diagram, demo instructions, setup guide
10. Record demo video using replay mode

---

## Environment Variables (per service)

**All services** share:

- `KITE_RPC_URL=https://rpc-testnet.gokite.ai/`
- `PAYMENT_ASSET=0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63`
- `OPENAI_API_KEY=sk-...`
- `FIRECRAWL_API_KEY=fc-...`

**Planner** additionally:

- `AGENTMAIL_API_KEY=am-...`
- `PLANNER_AGENT_PRIVATE_KEY=0x...` (wallet that holds 10 tokens)
- `PLANNER_SESSION_PRIVATE_KEY=0x...`
- `PLANNER_PAYMENT_PRIVATE_KEY=0x...` (same as agent or separate)
- `RIDER_URL=https://rider.up.railway.app`
- `FOODIE_URL=https://foodie.up.railway.app`
- `EVENTBOT_URL=https://eventbot.up.railway.app`
- `KITE_WEATHER_URL=https://x402.dev.gokite.ai`
- `PIEVERSE_URL=https://facilitator.pieverse.io`
- `DATABASE_URL=postgres://...`

**Each specialist** additionally:

- `AGENT_PRIVATE_KEY=0x...` (wallet that earns tokens)
- `PORT=4001/4002/4003`
- `PASSPORT_REGISTRY_ADDRESS=0x...`
- `SESSION_REGISTRY_ADDRESS=0x...`
- `RECEIPT_LOG_ADDRESS=0x...`

**Dashboard**:

- `NEXT_PUBLIC_PLANNER_URL=https://planner.up.railway.app`
- `NEXT_PUBLIC_KITE_RPC_URL=https://rpc-testnet.gokite.ai/`
- `NEXT_PUBLIC_PAYMENT_ASSET=0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63`
- `NEXT_PUBLIC_KITESCAN_URL=https://testnet.kitescan.ai`

---

## Passport Configuration (On-Chain Setup)

Before the demo, deploy passports for all 4 agents via the setup wizard:

**Planner Passport**:

- scopes: `["transport", "food", "events", "weather"]`
- services: `["rider", "foodie", "eventbot", "kite-weather"]`
- dailyCap: `5000000000000000000` (5.0 tokens -- set low to trigger budget failure)
- perCallCap: `2000000000000000000` (2.0 tokens)
- rateLimit: 20/min

**Rider Passport**: scopes: `["transport"]`, services: `["rider"]`
**Foodie Passport**: scopes: `["food"]`, services: `["foodie"]`
**EventBot Passport**: scopes: `["events"]`, services: `["eventbot"]`

Sessions granted for each agent with matching scope subsets.

---

## File Tree (New Files Only)

```
packages/agent-core/
  package.json
  tsconfig.json
  src/
    index.ts
    llm.ts          -- OpenAI function calling loop
    browser.ts       -- Firecrawl session manager
    agentmail.ts     -- AgentMail REST client
    pieverse.ts      -- Pieverse v2 facilitator
    sse-emitter.ts   -- SSE hub + DB recording

apps/planner/
  package.json
  tsconfig.json
  Dockerfile
  .env.example
  src/
    index.ts         -- entry point
    server.ts        -- Fastify + webhook + SSE + replay endpoints
    config.ts        -- env var loading (zod validated)
    orchestrator.ts  -- GPT-4o runTripPlan with all tools
    tools/
      weather.ts     -- get_weather (Pieverse x402 flow)
      hire.ts        -- hire_rider, hire_foodie, hire_eventbot (callPricedRoute)
      register.ts    -- register_event (callPricedRoute to EventBot)
      email.ts       -- email_agent, email_human (AgentMail)
      itinerary.ts   -- compile_itinerary (format results)

apps/rider/
  package.json
  tsconfig.json
  Dockerfile
  .env.example
  src/
    index.ts
    server.ts        -- Fastify + provider-kit enforcement
    config.ts
    handler.ts       -- LLM + Firecrawl ride search

apps/foodie/
  package.json
  tsconfig.json
  Dockerfile
  .env.example
  src/
    index.ts
    server.ts
    config.ts
    handler.ts       -- LLM + Firecrawl restaurant search

apps/eventbot/
  package.json
  tsconfig.json
  Dockerfile
  .env.example
  src/
    index.ts
    server.ts        -- TWO x402 routes
    config.ts
    find-handler.ts  -- LLM + Firecrawl event search
    register-handler.ts -- LLM + Firecrawl form filling

apps/web/  (modifications to existing)
  tailwind.config.ts     -- NEW
  postcss.config.js      -- NEW
  src/
    hooks/
      use-sse.ts         -- NEW
      use-wallet-balance.ts -- NEW
    lib/
      sse-context.tsx    -- NEW
      kite-rpc.ts        -- NEW
    components/
      console-layout.tsx         -- NEW
      agent-browser-panel.tsx    -- NEW
      thought-bubble.tsx         -- NEW
      email-thread.tsx           -- NEW
      enforcement-pipeline.tsx   -- NEW
      wallet-balances.tsx        -- NEW
      transaction-feed.tsx       -- NEW
      mission-control.tsx        -- NEW
      replay-button.tsx          -- NEW
      setup-wizard.tsx           -- NEW
    app/
      console/
        page.tsx         -- NEW (main demo page)
      page.tsx           -- MODIFY (landing page)
```
