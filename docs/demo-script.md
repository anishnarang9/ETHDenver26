# Demo Script (5-7 minutes)

## 1. Open Mission Console
- Open `http://localhost:3000/console`.
- Point out the three specialist panels (Rider, Foodie, EventBot), transaction feed, and enforcement timeline.

## 2. Trigger Planner
- Click `Plan Trip` (or call planner trigger API).
- Explain that planner is orchestrating specialists using tool calls.

## 3. Show x402 Agent-to-Agent Calls
- Highlight each specialist call:
  - Planner -> Rider (`/api/find-rides`)
  - Planner -> Foodie (`/api/find-restaurants`)
  - Planner -> EventBot (`/api/find-events`)
- Show transaction and enforcement updates in the console.

## 4. Show Browser + Thought Stream
- As specialists run, show:
  - browser session activation
  - thought updates (`llm_thinking`)
  - tool calls and returned outputs

## 5. Show Event Registration Path
- Trigger registration path via planner (`register_event` through EventBot).
- Confirm EventBot route `POST /api/register-event` is used and reflected in feed.

## 6. Show Replay
- Click `Replay Last Run`.
- Demonstrate event stream replay with original timing.

## 7. Show Guardrails
- In dashboard root view, revoke passport for EventBot agent.
- Back in console, run `post-revoke-test` or `scope-violation`.
- Explain expected blocked behavior from enforcement pipeline.
