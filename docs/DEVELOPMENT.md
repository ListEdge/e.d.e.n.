# Developing Eden

## Project map

```
src/
├── app/            Next.js — pages and API routes (thin; no logic here)
├── components/     The Mission Control UI (orb + HUD)
├── core/
│   ├── events/     Event vocabulary + Event Bus
│   ├── engines/    One file per engine, one responsibility each
│   └── kernel.ts   Boots everything; the only place engines are wired
├── providers/      One folder per external concern; types.ts is the contract
├── lib/            config (all env reads) + small utilities
└── types/          Domain nouns shared everywhere
supabase/           SQL migrations + seed
docs/               You are here
```

## Adding a provider implementation

Example: giving Eden a voice with OpenAI TTS.

1. Create `src/providers/voice/openai.ts` implementing `VoiceProvider`
   from `src/providers/voice/types.ts`.
2. In `src/providers/index.ts`, replace `voice: null` with an instance
   (guarded by `available()`).
3. Done. The Voice Engine already knows how to use it.

## Adding an engine

1. Create `src/core/engines/YourEngine.ts` implementing `Engine`.
2. Register it in `src/core/kernel.ts` (construct + add to the list).
3. Communicate only via `ctx.bus` and `ctx.providers`. If you need a new
   event type, add it to `src/core/events/types.ts`.

## Adding a capability

Register a `CapabilityManifest` with the Capability Manager declaring
the authorities it needs. High-risk authorities route through the
Permissions Engine automatically.

## Conventions

- No `process.env` outside `src/lib/config.ts`.
- No vendor SDK imports outside `src/providers/`.
- Engines never import engines.
- All timestamps are ISO strings; all ids are UUIDs.

## Commands

```bash
npm run dev         # local development
npm run build       # production build
npm run typecheck   # strict TypeScript check
```
