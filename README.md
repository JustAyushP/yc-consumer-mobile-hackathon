# RAVO

A role-play murder mystery for 3–6 friends, run by RAVO, an AI game master. Expo (expo-router, TypeScript) on the front, Convex on the back.

Players play entirely in iMessage and WhatsApp through Keiki. The app is a read-only companion opened from a personal link.

- `app/`: read-only screens (expo-router)
- `components/ui/`: noir theme tokens and primitives; `components/viewer.tsx`: the viewer token from the link
- `convex/`: `schema.ts`, plus one folder per lane: `game/`, `ravo/`, `chat/`, `cases/`

See [CONTRIBUTING.md](CONTRIBUTING.md) for lane ownership and how to run it.
