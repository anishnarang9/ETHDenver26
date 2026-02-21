# TripDesk Frontend Redesign Plan

## 1. Product Goal

Build a frontend that feels premium and cinematic while still being operationally clear:
- Make agent activity, payment enforcement, and outcomes legible in under 10 seconds.
- Keep the UI demo-friendly for hackathon judges and practical for daily operator use.
- Balance visual impact with trustworthy data density.

## 2. Visual Direction

### Core Theme: "Mission Control Noir"
- Atmosphere: dark steel + neon accents + warm warning tones.
- Personality: technical, urgent, high-signal, not playful.
- Composition: layered panels, glowing data rails, soft noise texture, subtle gradients.

### Color System (Initial)
- `--bg-0`: `#0A0F14` (page background)
- `--bg-1`: `#101822` (panel background)
- `--bg-2`: `#152232` (elevated cards)
- `--line`: `#243244` (borders/dividers)
- `--text-0`: `#EAF2FF` (primary text)
- `--text-1`: `#9EB1C8` (secondary text)
- `--accent-cyan`: `#33D1FF` (live/system)
- `--accent-lime`: `#8BFF61` (success/healthy)
- `--accent-amber`: `#FFB020` (pending/warning)
- `--accent-red`: `#FF5D6C` (fail/revoked)
- `--accent-blue`: `#5E8BFF` (navigation/highlight)

### Typography
- Display/headings: `Space Grotesk`
- UI/body: `IBM Plex Sans`
- Numeric/telemetry: `JetBrains Mono`
- Rules:
  - Large, tight headline hierarchy.
  - Monospace only for values, tx hashes, timestamps, balances.
  - Use uppercase micro-labels for panel metadata.

### Shape + Surfaces
- 14px base radius on cards, 20px on major shells.
- 1px borders + subtle inner highlights.
- Shadow strategy: soft external shadow + faint colored glow on active states.
- Panel density:
  - "Overview": airy
  - "Operations": compact

## 3. Motion + Interaction

### Motion Language
- Entry: 220-320ms fade/slide stagger on initial load.
- Live updates: pulse highlights on changed values (600ms decay).
- State transitions: spring for panel expand/collapse, ease for route changes.
- Avoid animation spam; only animate meaningfully (new event, state change, focus).

### Micro-Interactions
- Hover reveals operational hints ("scope check passed", "budget threshold warning").
- Click on tx hash opens block explorer in new tab.
- Keyboard-first navigation for all primary panels.

## 4. Layout System

### Breakpoints
- Mobile: 360-767
- Tablet: 768-1279
- Desktop: 1280+

### Grid
- Desktop: 12-column + fixed left rail.
- Tablet: 8-column.
- Mobile: single column with sticky bottom quick actions.

### Persistent UI
- Left rail: logo, main nav, environment chip, connection state.
- Top utility bar: mission selector, wallet summary, global command/search.

## 5. Planned Pages

## 5.1 `/` Dashboard (Mission Control)
Purpose: high-level operational awareness.

Sections:
- Hero status strip: current mission, health score, spend today, active agents.
- Live timeline: latest enforcement and agent events.
- Quick cards:
  - Budget remaining
  - Pending payments
  - Blocked requests
  - Revocation status
- Active agents grid: planner + specialists with live state.
- Recent transactions table.

Primary actions:
- Start mission
- Pause stream
- Open full traces

## 5.2 `/missions` Mission Runs
Purpose: inspect and compare runs.

Sections:
- Runs list with filters (status/date/agent).
- Run detail drawer with summary KPIs.
- Replay controls (speed, pause, jump to event).

Primary actions:
- Replay run
- Export run JSON
- Open related transaction set

## 5.3 `/enforcement` Pipeline Explorer
Purpose: make the 10-step pipeline understandable and debuggable.

Sections:
- Step rail (01-10) with current pass/fail counts.
- Step detail pane:
  - Why it passed/failed
  - Inputs checked
  - Error code mapping
- Failure cluster chart grouped by step.

Primary actions:
- Filter by step
- Copy failure payload
- Link to docs for each rule

## 5.4 `/agents` Agent Registry
Purpose: monitor and control agent capability.

Sections:
- Agent cards (planner/rider/foodie/eventbot/weather).
- Passport policy snapshot:
  - scopes
  - services
  - per-call and daily caps
  - expiry
- Session key status table.

Primary actions:
- Revoke passport
- Rotate session key
- View recent calls by agent

## 5.5 `/payments` Payment Ops
Purpose: full x402 and on-chain payment visibility.

Sections:
- Payment funnel: challenged -> paid -> verified -> failed.
- Recent settlements with status chips.
- Retry queue and unresolved proofs.

Primary actions:
- Open tx on explorer
- Retry verify
- Mark incident

## 5.6 `/settings` Environment + Integrations
Purpose: configure without touching code.

Sections:
- Environment selector (local/staging/demo).
- Service connections: OpenAI, Firecrawl, AgentMail, facilitator.
- Contract address panel.
- Feature flags (demo mode, replay mode, strict enforcement logs).

Primary actions:
- Validate config
- Test webhook connectivity
- Save and reload app state

## 5.7 `/styleguide` Internal Design System Page
Purpose: keep UI consistent while we iterate fast.

Sections:
- Tokens (colors, spacing, type scale, radii, shadows).
- Component catalog (buttons, cards, tables, tags, timeline items).
- Motion samples and state examples.

Primary actions:
- Copy token value
- Preview dark/light contrast variants

## 6. Component Inventory (Phase 1)

- `AppShell` (nav + topbar + content frame)
- `StatusPill` (success/warn/error/info)
- `MetricCard` (title, value, delta, sparkline)
- `EventTimeline` (stream list with type icons)
- `PipelineStepper` (10-step enforce flow)
- `AgentCard` (state, balance, controls)
- `TxTable` (sortable/filterable)
- `DetailDrawer` (context panels)
- `EmptyState` and `ErrorState`

## 7. Accessibility + UX Standards

- AA contrast minimum.
- Visible focus states everywhere.
- Reduced motion mode support.
- Keyboard complete for all critical actions.
- Clear system feedback for async operations (loading/success/failure).

## 8. Technical Direction

- Framework: Next.js App Router.
- Styling: Tailwind v4 + CSS variables token layer.
- Motion: Framer Motion (page entries + live updates).
- Charts: lightweight SVG-first (avoid heavy dashboard libs initially).
- Data: server components for initial snapshots + SSE client updates for live panels.

## 9. Implementation Phases

1. Foundation
- App shell, tokens, typography, layout scaffolding, styleguide page.

2. Core Operations
- Dashboard + live timeline + agent cards + transaction table.

3. Deep Ops Pages
- Enforcement explorer, mission runs with replay, payment ops.

4. Control Plane
- Agent registry actions, settings, validation flows.

5. Polish
- Motion tuning, accessibility pass, empty/error states, performance cleanup.

## 10. Success Criteria

- New user can identify mission status, spend, and failures in < 10 seconds.
- Demo path (start mission -> observe events -> inspect failure -> view tx) works without dead ends.
- Lighthouse (desktop) targets:
  - Performance: 85+
  - Accessibility: 95+
  - Best Practices: 95+
