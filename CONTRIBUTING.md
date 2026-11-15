# Contributing

Three builders work in parallel on this foundation. The lane plan, scope, and "done for the demo" for each lane live in `plans/builder-lanes.md` in the project Capy Drive.

## Who owns what

| Lane | Owner | Folders |
| --- | --- | --- |
| RAVO and the game engine | Builder 1 | `convex/ravo/`, `convex/game/`, `convex/crons.ts`, `convex/schema.ts` |
| Chat and comms on Keiki | Builder 2 | `convex/chat/`, `convex/http.ts`, `keiki/`, `components/chat/` |
| App, UI, and the case | Builder 3 | `app/`, `components/` (except `components/chat/`), `assets/`, `convex/cases/` |

Don't edit another lane's folders; ask its owner. Root config (`package.json`, `app.json`, `tsconfig.json`, `eslint.config.js`) is shared, so keep changes there small and say so in your PR.

## Rules

- **Schema changes go through the game lane (Builder 1).** `convex/schema.ts` is the shared data contract.
- **Cross-lane calls use `convex/_generated/api` only.** Call another lane's functions through `api.*` / `internal.*` references (`ctx.runQuery`, `ctx.runMutation`, `ctx.runAction`, `ctx.scheduler.runAfter`, `useQuery`, `useMutation`), never by importing its files. Types come from `convex/_generated/dataModel`. The one shared type outside those is `RavoDirective` in `convex/ravo/types.ts`, which RAVO owns and chat imports.
- **Function names and arguments are the contract.** If you change one, change it in your lane and tell its callers.
- **RAVO acts only through engine mutations** (`internal.game.engine.*`), so a bad LLM output can't break the rules. All outbound game and RAVO messages go through `internal.chat.messages.postRavoMessage`.
- Secrets live only in the Convex env and the machine env (`CONVEX_DEPLOY_KEY`, `KEIKI_API_KEY`). Never commit them.
- Small PRs, one branch each. Yash merges.

## The contract at a glance

| Lane | Functions |
| --- | --- |
| game | `game/groups`: create, join, start, get · `game/survey`: questions, submit · `game/roles`: list, assign (internal) · `game/session`: today, submitAnswer, useAbility, complete · `game/board`: get · `game/accuse`: accuse, reveal · `game/engine`: unlockClue, recordInsight, giveHint, issueWarning, fastForwardDay (internal), fastForward (demo control) |
| ravo | `ravo/entry`: onMessage, onAnswer, dailyCheck · `ravo/consult`: consult → `RavoDirective` · `ravo/llm`: complete (LLM wrapper with fallback) · `ravo/scoring`, `ravo/clues` (unfold), `ravo/hints` (request), `ravo/pace` (checkLag), `ravo/lateJoiner` (writeIn) |
| chat | `chat/messages`: send, list (live), postRavoMessage (internal), get (internal) · `http.ts`: `POST /keiki/turn`, `POST /keiki/consult` |
| cases | `cases/velvetLantern.ts` (typed `SeedCase` data) · `cases/seed`: seed (internal, idempotent) |

The bodies are minimal but working, so the whole loop runs end to end today. Each lane replaces its own bodies.

## Running it

```bash
npm ci
npx convex dev --once               # "convex push": deploys functions, writes .env.local
npx convex run cases/seed:seed      # loads the seeded case into the case tables (idempotent)
npx expo start --web --port 8081    # "expo web"
npx tsc --noEmit && npx expo lint   # "typecheck" and "lint"; both must be clean before a PR
```

RAVO's LLM calls go through the Convex AI gateway (`RAVO_MODEL`, default `anthropic/claude-haiku-4.5`). Set `RAVO_OFFLINE=1` in the Convex env to force the deterministic fallback.
