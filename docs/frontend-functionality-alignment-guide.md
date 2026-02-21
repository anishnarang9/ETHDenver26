# Frontend Functionality Alignment Guide (Using `functionality_only` as Functional Reference)

## Purpose
This guide defines the exact functional changes required to make the current frontend (`apps/web`) compatible with the merged backend, using `functionality_only/web` strictly as a behavior reference.

Design, layout language, styling motifs, spacing systems, visual hierarchy, color treatment, and motion aesthetics from `functionality_only` are explicitly out of scope.

## Non-Negotiable Constraint
- Source of truth from `functionality_only`: functionality only.
- Explicitly forbidden: any visual/design inspiration from `functionality_only`.
- If a functionality fix would require changing UX structure (not just behavior wiring), we will stop and request user approval before implementation.

## Scope
- In scope:
  - Setup flow behavior, progression rules, and on-chain setup semantics.
  - Dashboard data model, SSE ingestion, run lifecycle, control actions, and backend contract compatibility.
- Out of scope:
  - Restyling pages/components.
  - Introducing new visual paradigms from reference implementation.

---

## Current vs Reference: Functional Gap Analysis

## 1) Setup Flow Gaps

### Gap 1.1: Wrong setup target model
Reference behavior (`functionality_only`):
- Setup provisions only orchestrator/planner wallet in wizard steps.
- Sub-agents are spawned dynamically at runtime; they are not pre-provisioned in setup.

Current behavior (`apps/web`):
- Setup expects static env wallets for Planner, Rider, Foodie, EventBot.
- Passport/session writes are attempted for all configured addresses.

Impact:
- Step completion can fail or hang if auxiliary agent env vars are missing or not funded.
- Behavior diverges from backend architecture where specialist agents are runtime-spawned.

Required change:
- Rebase setup provisioning target to planner-only operational setup.
- Keep multi-agent env support optional/informational if needed, but not gating.

### Gap 1.2: On-chain setup idempotency regression
Reference behavior includes idempotency support:
- Passport/session checks can skip writes if already configured.

Current behavior:
- Direct writes attempted every time.
- Existing state may trigger failures/noisy errors.

Impact:
- Re-running setup on already-configured environments is brittle.

Required change:
- Reinstate idempotent write semantics (skip-on-existing) or equivalent safe retry behavior.

### Gap 1.3: Chain handling regression
Reference behavior:
- Handles wrong-network wallet state with switch/add chain flow.

Current behavior:
- Throws if chain mismatch.

Impact:
- Setup fails hard for users not already on correct chain.

Required change:
- Restore automatic chain switch/add behavior in wallet signer acquisition.

### Gap 1.4: Step completion semantics
Reference behavior:
- Steps are completion-driven; wizard advances as prerequisites resolve.
- Funding step auto-polls and completes when threshold met.
- Readiness checks are explicit and stable.

Current behavior:
- Manual stepping mixed with side effects.
- `setSetupComplete(true)` is triggered when first 5 steps are complete (before explicit final proceed click).

Impact:
- Gating can unlock earlier than intended.
- User intent (“Proceed to Dashboard”) is not strictly the completion boundary.

Required change:
- Only mark setup complete on explicit final confirmation action (or explicit skip-to-dashboard action).
- Keep step progression deterministic and prerequisite-based.

### Gap 1.5: Service readiness contract mismatch
Reference behavior:
- Health check focused on orchestrator/planner service.

Current behavior:
- Checks planner and gateway as hard requirements.

Impact:
- Setup may fail in environments where gateway is intentionally unavailable during initial bring-up.

Required change:
- Make planner health mandatory.
- Gateway health either optional or non-blocking informational (decision gate: see “Approval Gates”).

---

## 2) Dashboard/SSE Gaps

### Gap 2.1: Missing run-boundary reset semantics
Reference behavior:
- On new `runId`, SSE state resets to avoid cross-run contamination.

Current behavior:
- No run-boundary reset.

Impact:
- Stale emails/transactions/agent states leak across runs.

Required change:
- Reintroduce run-aware reset logic keyed by `runId` transitions.

### Gap 2.2: Partial SSE event model
Reference behavior tracks additional orchestration events:
- `orchestrator_phase`
- `agent_plan_created`
- `agent_results`
- `agent_inbox_created`
- `orchestrator_decision`
- `agent_email_sent` / `agent_email_received`

Current behavior:
- Handles core events but omits orchestration state model (phase/plan/results/inbox mapping).

Impact:
- Dashboard cannot accurately represent orchestration lifecycle and email-chain topology.

Required change:
- Expand SSE reducer/state model to include orchestration metadata and inbox mappings.

### Gap 2.3: Kill-flow behavior parity
Reference behavior:
- `/api/kill` tied to runtime orchestration state and immediate UI state reset.

Current behavior:
- Kill endpoint exists in Mission Control, but visibility/behavior is not phase-driven.

Impact:
- Operational control UX can desync from actual run status.

Required change:
- Gate kill controls by active run phase and ensure deterministic post-kill state transition.

### Gap 2.4: Email edge attribution for spawned agents
Reference behavior:
- Uses inbox-address mapping to resolve sender/recipient agent links.

Current behavior:
- Simplified edge derivation; recipient often stored as raw email string only.

Impact:
- Intra-agent communication graph/detail views degrade or become inaccurate.

Required change:
- Restore inbox->agent resolution flow and edge attribution model.

---

## Implementation Plan (No Visual Redesign)

## Phase 0: Safety Guardrails (No functional behavior changes yet)
1. Snapshot current frontend contract points for setup/dashboard.
2. Add temporary logging around setup transitions and SSE run transitions (dev-only).
3. Confirm backend endpoints currently live:
   - Planner: `/api/events`, `/api/trigger`, `/api/kill`, `/api/agents`, `/api/runs`, `/api/replay/:runId`, `/health`.

Deliverable:
- Verified contract checklist before functional edits.

## Phase 1: Setup Functional Realignment

### Files
- `apps/web/src/components/setup-wizard.tsx`
- `apps/web/src/lib/onchain.ts`
- `apps/web/src/lib/setup-state.ts` (logic only, likely no schema change)

### Tasks
1. Rebase setup gating requirements to planner-first workflow:
   - Step funding/provisioning should not require static rider/foodie/eventbot env addresses.
2. Restore idempotent on-chain setup behavior:
   - Passport/session checks before writes.
   - Treat already-configured as success.
3. Restore chain auto-switch/add in signer path.
4. Enforce completion boundary:
   - `setSetupComplete(true)` only on explicit final action (`Proceed to Dashboard`) or explicit skip-to-dashboard escape.
   - Remove automatic complete side-effect tied to earlier step aggregate completion.
5. Keep current UI surface and style, only adjust state transitions, validation, and API/on-chain logic.

Acceptance criteria:
- Setup can be re-run repeatedly without failing on already-provisioned state.
- Setup does not block on missing non-planner agent env vars.
- Setup completion flag is set only at explicit finalization points.

## Phase 2: Dashboard SSE Contract Completion

### Files
- `apps/web/src/lib/sse-context.tsx`
- `apps/web/src/hooks/use-sse.ts`
- `apps/web/src/components/console-layout.tsx`
- `apps/web/src/components/mission-control.tsx`

### Tasks
1. Reinstate run lifecycle logic:
   - Reset store when incoming `msg.runId` changes.
2. Reintroduce orchestration state slices:
   - `orchestratorPhase`, `agentPlan`, `agentResults`, `synthesisBody`, `inboxAddresses`.
3. Expand event mapping reducers:
   - `orchestrator_phase`, `agent_plan_created`, `agent_results`, `agent_inbox_created`, `orchestrator_decision`.
4. Normalize email-chain events:
   - Preserve both message list and edge graph attribution through inbox resolution.
5. Tie kill control semantics to active run phase.

Acceptance criteria:
- New run starts with clean dashboard state.
- Dashboard can represent planner orchestration lifecycle from SSE events.
- Agent-to-agent email relationships resolve correctly when inbox addresses are present.

## Phase 3: Setup/Dashboard End-to-End Validation

### Test matrix
1. Fresh setup (new wallet, no prior passport/session):
   - All steps pass and final proceed unlocks dashboard.
2. Repeat setup (wallet already provisioned):
   - Passport/session steps complete via idempotent success path.
3. Missing specialist env vars:
   - Setup still succeeds if planner path is healthy.
4. Dashboard trigger run:
   - SSE updates populate, run ID assigned, UI resets on next run.
5. Kill during active run:
   - `/api/kill` acknowledged and UI transitions to stopped state.
6. Replay last run:
   - Replay stream loads, live stream resume works.

Deliverable:
- Functional verification checklist in commit summary.

---

## Detailed Change Mapping

## A. `setup-wizard.tsx`
Planned logic edits:
- Replace hard requirement on all static agent env wallets with planner-centric setup gate.
- Make funding status logic robust when optional wallets are absent.
- Update step state machine:
  - Explicit transitions and completion criteria.
  - Final proceed is the only canonical setup-complete trigger.
- Preserve existing current look-and-feel and motion patterns.

## B. `onchain.ts`
Planned logic edits:
- Reintroduce:
  - chain switch/add helpers,
  - read checks for existing passport/session,
  - skip return semantics.
- Keep existing API signatures compatible with setup wizard calls.

## C. `sse-context.tsx`
Planned logic edits:
- Add orchestration-related state fields and reducers.
- Restore runId edge-triggered reset behavior.
- Restore inbox-based email edge resolution logic.

## D. `use-sse.ts`
Planned logic edits:
- Ensure full event subscription list includes orchestration/email-chain events from backend.
- Maintain reconnect behavior.

## E. `console-layout.tsx` + `mission-control.tsx`
Planned logic edits:
- Ensure controls/actions reflect orchestration phase and run activity.
- Keep current page structure unless functionality requires otherwise.

---

## Approval Gates (Will Ask Before Proceeding)
Per user directive, these are functionality changes that may impact UX structure and require explicit confirmation before implementation:
1. If restoring orchestration functionality requires reintroducing graph/detail panes not present in current dashboard layout.
2. If setup must expose additional status sections to surface planner-only vs optional-agent readiness distinctly.
3. If kill controls need relocation to preserve operational clarity.

No such structure-level decisions will be made unilaterally.

---

## Risks and Mitigations
- Risk: Backend emits event payload variants not covered by reference assumptions.
  - Mitigation: defensive payload parsing + fallback fields.
- Risk: Idempotent on-chain reads may fail under RPC instability.
  - Mitigation: treat read failures as “attempt write with guarded error handling,” not immediate hard fail.
- Risk: Setup completion localStorage race during route transitions.
  - Mitigation: centralize `setSetupComplete` trigger in explicit handlers only.

---

## Definition of Done
1. Setup flow behavior matches reference functionality against merged backend contracts.
2. Dashboard operational behavior (run lifecycle, kill, replay, SSE state model) matches reference functionality.
3. No design/styling inspiration imported from `functionality_only`.
4. Build and typecheck pass.
5. End-to-end smoke tests pass for setup -> dashboard -> run -> kill -> replay.

