# Brain runtime

The Brain coordinates a shared case behind character conversations. Game state changes
through internal engine mutations; the app is a read-only projection, not a gameplay
input channel. Comms owns provider authentication, routing and delivery. This describes
the merged source, not an assertion that the live integration is deployed or proven.

## Contribution provenance

Advitiya Kumar directed and reviewed Brain product requirements, including backstage
orchestration, shared progress, private knowledge and seven-segment pacing. Related
merged work includes the [director primitives](https://github.com/JustAyushP/yc-consumer-mobile-hackathon/pull/4)
and [integrated SF runtime](https://github.com/JustAyushP/yc-consumer-mobile-hackathon/pull/15).
These were collaborative implementations; this does not claim individual authorship of
their code or alter historical commit attribution.

## Story and conversations

The revision-bound SF case opts into exactly seven sequential narrative segments.
Each has reviewed openings, highs, hooks and content eligibility, with entry and exit
gates over authored beats, insights, clues and flags. `integration/segments.ts` validates
the definitions and advances at most one step per consult; state and narration are
shared by the group. Progress is driven by eligibility, not one segment per calendar
day or an all-player barrier. Role-specific invitations encourage participation without
requiring an absent detective. Segment seven is the payoff; there is no eighth segment.
Legacy unversioned cases retain their existing timing and accusation behavior.

Line 1 is the common character; lines 2 and 3 are per-player character assignments.
These are separate private conversations, not shared global knowledge. Consult builds
guidance for the authenticated player, group and line from reviewed, currently
authorized facts. Common context uses public report summaries; private ability results
and hints stay with their recipient. Never put player-specific knowledge into a shared
line's global persona. An authorization record is not proof of delivery or reading.

## Commands, recovery and finale

`commands/dispatch.ts` accepts internal structured survey, answer, ability, hint and
accusation commands. It checks the stored Keiki message, player, group, line, agent,
case and intake day, and uses receipts to reject conflicting replays. This is a trust
boundary: Comms must authenticate the sender and supply trusted structured intent;
freeform model output alone is not a gameplay command or proof of identity.

For SF, `integration/recoverDeduction.ts` offers an explicit internal recovery path
for a missed deduction: it checks a common-line message, current case/day and revision,
segment eligibility and source evidence, then records a receipt. Matching is lexical,
not semantic; negation and keyword stuffing can produce incorrect matches. Recovery
is not yet wired to authenticated live transport.

SF accusations require completed segment seven and pending answers to be scored;
early attempts do not score a suspect or increment wrong attempts. Accusations must
arrive through the common line; private-slot attempts are rejected with a redirect.
A correct accusation
marks the case solved and permits the authorized reveal. Other cases retain their
existing rules. No solution belongs in prompts or this document.

## Optional daily gate

`groups.dailyTurnLimit` is opt-in: absent or zero disables charging and completion
gating; a positive value enables a per-player/day budget. Only enabled groups can
auto-complete from authored `requiredForSession` questions. A configured budget can
block outstanding required work, so enabling it requires a separate policy decision.
Recovery and its consult reuse admission rather than charging twice. See
`integration/daily.ts` and the runtime tests for accounting details and exceptions.

## Viewer contract

`viewer.ts` exposes token-scoped read queries for the role, case, board, story, team,
history, hints, timeline and solved reveal. Tokens are bearer links, scoped to the
player and group and checked for expiry; protect them accordingly. Board and story
apply segment visibility, and personal findings, hints and narration are recipient
filtered. Player chat is not story narration. The viewer exposes no gameplay writes;
it is not evidence of provider delivery or conversation-history isolation.

## Local verification and limits

From the repository root, after installing the locked dependencies:

```sh
npx vitest run --config convex/game/vitest.config.ts
npx vitest run --config convex/cases/vitest.config.ts
node --test convex/ravo/director/director.test.mjs
npm run lint
npm run typecheck
git diff --check
```

These are offline source tests, including simulated messages and case fixtures. They do
not verify real Telegram/Keiki identity, delivery, provider history isolation or native
client behavior. Integrated reviewed-option selection currently runs deterministic
offline, not a live Brain model. Private-slot completion authorization is not exported;
live structured intake remains Comms-owned. The SF installer is internal and isolated;
running tests does not authorize a deployment, seed, provider call or production rollout.
