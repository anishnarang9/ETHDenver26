# TripDesk Frontend Visual + Graphic Design Specification

## 1. Purpose of this document

This document defines the exact visual and graphic direction for a full frontend rebuild of TripDesk in Next.js, with a YC-backed startup aesthetic and a Web3-native dynamic 3D vibe. It is intentionally implementation-aware but code-free.

Goals:
- Make the product feel premium, serious, and fundable.
- Keep the interface legible for operational workflows (live monitoring, controls, timeline evidence).
- Avoid generic "dashboard template" visuals.
- Create a coherent 3D motion system that supports function, not just decoration.

Non-goals:
- Reproducing old UI structure or styling.
- Designing for dark mode first if it weakens contrast/readability.
- Maximal animation at the cost of performance.

---

## 2. Brand Character: "Orbital Mission Control"

Visual personality:
- YC-backed energy: precise, modern, optimistic, high-velocity.
- Web3 confidence: depth, glow, gradients, glass, real-time movement.
- Enterprise seriousness: disciplined layout, meaningful hierarchy, hard data surfaces.

Key adjectives:
- Surgical
- Kinetic
- Trustworthy
- Technical
- Forward

What to avoid:
- Neon cyberpunk overload.
- Flat SaaS default cards + generic line icons only.
- Purple-heavy cliché crypto look.

---

## 3. Visual System Foundation

## 3.1 Color Strategy

Primary palette (core brand):
- `Void`: `#070B14` (base deep background)
- `Graphite`: `#101828` (panel surfaces)
- `Slate`: `#1D2939` (elevated surfaces)
- `Cloud`: `#E4E7EC` (primary text)
- `Fog`: `#98A2B3` (secondary text)

Accent palette (action + identity):
- `Cyan Core`: `#22D3EE`
- `Electric Blue`: `#3B82F6`
- `Mint Signal`: `#34D399`
- `Amber Alert`: `#F59E0B`
- `Redline`: `#F04438`

Gradient families:
- Hero gradient: `#22D3EE -> #3B82F6 -> #6366F1` (used for key heading/rings)
- Success gradient: `#34D399 -> #10B981`
- Risk gradient: `#F59E0B -> #F97316`
- Critical gradient: `#F04438 -> #B42318`

Usage discipline:
- 70% neutral surfaces
- 20% cool accents
- 10% status colors

## 3.2 Typography

Font stack to project high-end startup confidence:
- Display: `Sora` (or `Syne` alternative for bolder branding moments)
- Body/UI: `Manrope`
- Mono/data: `JetBrains Mono`

Scale:
- Hero title: 56/64 desktop, 40/46 mobile
- Section title: 24/30
- Card title: 16/22
- Body: 14/22
- Data tiny: 12/16

Typographic behavior:
- Tight tracking on display text (`-0.02em` to `-0.03em`)
- Normal tracking on body
- Slight positive tracking (`0.04em`) for labels/badges

## 3.3 Shape Language

- Base radius: 14px
- Small radius: 10px
- Pill radius: 999px
- Border style: subtle alpha lines (`rgba(255,255,255,0.08)`)
- No hard black borders unless critical alerts

Visual metaphor:
- "Orbital" motifs: arcs, rings, trajectories, nodes.
- Cards feel like instrument panels, not paper rectangles.

---

## 4. Spatial Composition and Layout

## 4.1 App Shell

Desktop grid:
- Top command rail (status, wallet, environment, run controls)
- Left nav (thin, icon-first, collapsible)
- Main canvas (content + panels)
- Right evidence drawer (contextual details)

Target max width:
- `1440px` centered content area
- breathing margins at 24px/32px

Vertical rhythm:
- Base spacing unit 4px, primary steps 8/12/16/24/32

## 4.2 Page Types

1. Landing / Entry page
- Big visual story + CTA to setup/run console
- Animated 3D ambient background

2. Setup flow (wizard)
- Four-step or six-step sequence with progress rail
- Strong "you are here" orientation

3. Live Run Console
- Multi-panel real-time layout
- Browser session cards + timeline + transaction feed

4. Guardrails / Governance page
- Policy cards, limits, scopes, revocation controls

5. Timeline / Evidence page
- Query/filter + forensic drill-down + proof references

---

## 5. 3D and Motion Language

## 5.1 3D Philosophy

3D should communicate:
- System depth (multiple agents/services)
- Live state transitions
- Economic flows (payments + settlements)

3D methods (web-safe):
- CSS perspective layers + transform stacks for baseline depth
- Framer Motion for orchestration
- Optional lightweight WebGL canvas (react-three-fiber) only for hero ambient scene

## 5.2 Motion Principles

- Motion is stateful, not decorative.
- Every animation must map to domain events (payment started, service active, blocked, replaying).
- Idle motion is low amplitude and low frequency.

Timing system:
- Fast UI feedback: 120-180ms
- Panel transitions: 220-320ms
- Complex reveals: 450-700ms

Easing:
- Default: `[0.22, 1, 0.36, 1]`
- Alert/critical: sharper ease-out
- Background ambient: linear or very slow ease-in-out

## 5.3 Signature Motion Components

1. Orbital Grid Background
- Subtle parallax mesh with radial light bloom.
- Moves slightly with pointer/scroll.

2. Agent Activity Rings
- Each agent card has ring pulses when active.
- Ring color follows agent identity.

3. Payment Trajectory Lines
- Animated line/particle from payer to target service.
- Completes to success glow or failure break.

4. Enforcement Pipeline Progression
- 10 steps represented as nodes on a curved track.
- Active node pulses, passed nodes lock green, failed node fractures red.

5. Replay Mode Time-Warp
- Visual mode shift (desaturated + scanline shimmer + replay timestamp badge).

---

## 6. Graphic Elements by Surface

## 6.1 Top Command Rail

Must include:
- Logo/wordmark (TripDesk)
- Environment badge (Kite Testnet)
- Gateway/planner health chips
- Connected wallet chip
- Run state (Live / Replay / Idle)

Graphic treatment:
- Frosted glass surface with subtle gradient border
- Tiny animated status LEDs
- Active run indicator with rotating conic gradient arc

## 6.2 Left Navigation

- Slim, icon-led nav with labels expanded on hover or full mode.
- Current item gets luminous rail + floating highlight background.
- Include quick actions: "New Run", "Emergency Revoke".

## 6.3 Setup Experience

Visual model:
- Step cards float on layered backdrop.
- Central progress spine with nodes.
- Each completed step "locks in" with satisfying micro animation.

Graphics:
- Wallet step: chain-link motif
- Funding step: token particle fill meter
- Passport/session step: shield + key iconography with orbit animation
- Readiness step: service heartbeat graph

## 6.4 Agent Browser Panels

- Three specialist cards in a responsive matrix.
- Each card has:
  - agent avatar glyph
  - status capsule
  - live view embed area
  - thought stream overlay

3D styling:
- Slight perspective tilt on hover
- Edge lighting based on activity status
- Revoked state applies red veil + static noise overlay

## 6.5 Enforcement Pipeline Panel

Structure:
- Horizontal/arc hybrid timeline of 10 checks.
- Expandable detail pane for each node.

Graphics:
- Distinct icons per step category (identity, session, scope, service, nonce, rate, budget, quote, payment, receipt)
- Animated connector beam
- Failure node emits fractured red shards effect (2D shader simulation)

## 6.6 Transaction Feed

- Stream of payment events as compact cards.
- Each entry shows actor -> target, amount, method, hash status.

Graphics:
- Amount rendered in mono with token icon
- Animated checkmark bloom on completion
- Explorer link as "chip" button with external icon

## 6.7 Timeline + Evidence Surface

- Two-column: filter/query list + evidence inspector
- Inspector uses layered tabs:
  - Envelope
  - Challenge
  - Settlement
  - Receipt

Graphics:
- Diff-like data blocks
- Hash strings in monospace with copy affordance
- "Proof chain" visual breadcrumbs

---

## 7. Component-Level Style Guide

## 7.1 Buttons

Primary CTA:
- High-energy gradient fill
- Soft outer glow on hover
- Press depth reduction (`translateY(1px)`)

Secondary:
- Muted dark panel + light border
- No glow until hover

Danger:
- Redline gradient
- Subtle warning pulse only when enabled

## 7.2 Inputs

- Dark translucent field with inner stroke
- Focus ring in cyan/blue
- Optional inline unit labels (atomic, wei, per min)

## 7.3 Cards

- Base: dark elevated panel
- Layered with pseudo-element gradient frame
- Header/body/footer segmentation with low-contrast dividers

## 7.4 Badges / Chips

- Compact pills, mono or small-caps labels
- Semantic colors for status
- Optional dot pulse for live states

## 7.5 Tables / Lists

- Use row cards over strict table grid for responsiveness
- Keep key IDs and numeric values in mono

---

## 8. Iconography and Illustrative Direction

Icon style:
- Crisp, thin-medium stroke vector (Lucide-compatible)
- Mix line icons with occasional filled status symbols for emphasis

Custom glyphs to create:
- Passport shield
- Session key
- Payment spark
- Receipt seal
- Replay clock

Illustration approach:
- No cartoon scenes.
- Abstract technical motifs (network nodes, route paths, ring systems).

---

## 9. Responsiveness and Adaptive Behavior

Breakpoints:
- Mobile: `<= 768`
- Tablet: `769 - 1024`
- Desktop: `1025+`

Behavior changes:
- Mobile collapses left nav into bottom sheet/tab bar.
- 3D effects reduce amplitude on small screens.
- Panels stack with priority order:
  1) Run controls/status
  2) Live timeline/events
  3) Agent panels
  4) Secondary diagnostics

Touch adaptation:
- Replace hover-reliant effects with tap states.
- Minimum hit areas 44px.

---

## 10. Accessibility + Readability Constraints

Required:
- WCAG AA contrast on all text and controls.
- Motion-reduced mode via `prefers-reduced-motion`:
  - disable parallax
  - replace complex transitions with fades
  - stop looped pulses where possible

Data clarity:
- Never rely on color only for state.
- Pair color with icon/label/text.

Keyboard:
- Full focus visibility on all controls
- Logical tab order across panelized layouts

---

## 11. Performance Guardrails for Rich Visuals

Budgets:
- Initial load JS target: keep design system lean; defer heavy visual libs.
- 60fps target for core interactions on modern laptops.

Rules:
- Prefer CSS transforms/opacity over layout thrashing.
- Limit concurrent infinite animations.
- Throttle high-frequency UI updates from SSE before paint-heavy rendering.
- Use canvas/WebGL only in isolated hero/background layer, not inside operational panels.

---

## 12. Visual States Map

Global app states:
- Idle: calm ambient glow
- Active run: increased motion, brighter accents
- Replay: tinted mode + timestamp treatment
- Error: red edge highlights and explicit banners

Agent card states:
- Standby
- Active
- Closed
- Revoked

Pipeline node states:
- Pending
- Processing
- Passed
- Failed

Transaction states:
- Awaiting quote
- Payment pending
- Settlement verified
- Failed/blocked

---

## 13. Suggested Page-by-Page Art Direction

## 13.1 Home / Entry

- Hero with orbital scene behind content.
- Main heading: strong startup statement.
- CTA blocks for Setup and Console.
- Lightweight metric strip (actions, receipts, latency).

## 13.2 Setup

- Structured wizard with animated step spine.
- Real-time wallet funding cards.
- Transaction confirmation toasts as anchored system notifications.

## 13.3 Console

- Primary ops theater.
- Emphasis on live updates + control confidence.
- Minimal text noise, strong event semantics.

## 13.4 Guardrails

- Policy editing with risk meter and safe presets.
- Clear warning affordances around revocation.

## 13.5 Timeline/Evidence

- Forensic reading mode.
- Dense but readable mono data views.
- Export/copy proof bundle affordance.

---

## 14. Design Tokens (initial proposal)

Core tokens:
- `--bg-0`, `--bg-1`, `--bg-2`
- `--text-0`, `--text-1`, `--text-2`
- `--accent-cyan`, `--accent-blue`
- `--ok`, `--warn`, `--danger`
- `--radius-sm`, `--radius-md`, `--radius-lg`
- `--shadow-soft`, `--shadow-glow-cyan`, `--shadow-glow-danger`

Motion tokens:
- `--dur-fast: 140ms`
- `--dur-base: 240ms`
- `--dur-slow: 520ms`
- `--ease-out: cubic-bezier(0.22, 1, 0.36, 1)`

Z-index layers:
- Background ambience
- Base content
- Floating panels
- Popovers
- Critical overlays

---

## 15. Visual QA Checklist (pre-implementation acceptance)

1. Does this look like a serious, premium startup product instead of a hackathon template?
2. Are key workflows legible in under 10 seconds?
3. Does every animation communicate state?
4. Is the 3D vibe present without harming readability/performance?
5. Can a first-time user immediately find wallet status, run controls, and evidence?
6. Are critical actions (revoke, failures) unmistakable?

---

## 16. Execution Order for Implementation (visual-first)

1. Create tokenized theme foundation (colors, type, spacing, shadows, motion).
2. Build shell primitives (rail/nav/panel/chip/button/input).
3. Implement ambient background + subtle 3D framework.
4. Build Setup screen visuals.
5. Build Console screen visuals.
6. Build Timeline/Evidence screen visuals.
7. Add replay-specific visual mode.
8. Add accessibility/motion-reduction pass.
9. Performance tuning pass.

---

## 17. Final style statement

TripDesk should feel like the control plane for autonomous economic agents: cinematic but disciplined, futuristic but credible, expressive but operationally clear. The design should look investable on first impression and dependable under live load.
