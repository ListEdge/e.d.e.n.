# Eden Architecture

## The shape of the system

```
        ┌──────────────────────── UI (Mission Control) ───────────────────────┐
        │   Eden Core orb · engine rail · context · event stream · command    │
        └───────────────────────────────┬──────────────────────────────────────┘
                                        │ HTTP (API routes)
        ┌───────────────────────────────▼──────────────────────────────────────┐
        │                             KERNEL                                    │
        │  boots engines · resolves providers · cached across warm invocations │
        └───────────────────────────────┬──────────────────────────────────────┘
                                        │
     ┌──────────────────────────────────▼───────────────────────────────────┐
     │                            EVENT BUS                                  │
     │        every engine publishes; any engine may subscribe               │
     └──┬───────┬───────┬───────┬───────┬───────┬───────┬───────┬───────┬───┘
        │       │       │       │       │       │       │       │       │
   Conversation Memory Knowledge Planner Developer Presence Context Scenes ...
        │       │       │       │       │       │       │       │       │
     ┌──▼───────▼───────▼───────▼───────▼───────▼───────▼───────▼───────▼───┐
     │                        PROVIDER REGISTRY                              │
     │   AI · Database · Voice · Maps · Email · Calendar · Storage ·        │
     │   Deployment · GitHub · Phone · Payments · Home · Search             │
     └───────────────────────────────────────────────────────────────────────┘
```

## The three rules

1. **Engines never import engines.** They communicate through the Event
   Bus (`src/core/events/EventBus.ts`). If an engine needs to react to
   something, it subscribes to the event, not to the engine.
2. **Nothing calls a vendor directly.** OpenAI, Anthropic, Supabase,
   Vercel, Home Assistant — all invisible behind provider contracts in
   `src/providers/*/types.ts`. Swapping a vendor is one new class plus
   one changed factory line.
3. **Every action carries an authority level.** `read`, `write`,
   `communicate`, `deploy`, `purchase`, `delete`, `unlock`. The
   Permissions Engine auto-approves the first two and demands explicit
   approval for the rest.

## Engines (v1)

| Engine | Responsibility | Status |
| --- | --- | --- |
| Conversation | Intent in, reply out; context assembly | Live |
| Memory | Knowledge storage and recall | Live (keyword recall; vector-ready) |
| Knowledge | Entity graph: people, businesses, projects... | Live |
| Planner | Goal → tasks decomposition via AI | Live |
| Developer | Plan → code → PR → deploy pipeline | Contract + planning live; ships when GitHub/Deploy providers land |
| Presence | Publishes where/how the user is | Live (awaiting real signals) |
| Context | The "now" snapshot | Live |
| Scene Manager | Context → scene activation | Live (device actuation awaits Home provider) |
| Permissions | Authority levels, approvals | Live |
| Notifications | Single doorway to the user's attention | Live |
| Capability Manager | Installable module registry | Live |
| Analytics | Event counters + persisted history | Live |
| Voice | Speech in/out | Awaiting VoiceProvider |
| Communications | Email + calls, honest self-identification | Awaiting Email/Phone providers |

## Memory model

Memory stores **knowledge, not chat logs**: types include `knowledge`,
`long_term`, `semantic`, `preference`, `goal`, `project`, `relationship`,
`business`. Recall is keyword-based today; the schema and repo interface
are already shaped for pgvector semantic recall (see the commented block
in `supabase/migrations/0001_init.sql`).

## Serverless reality

On Vercel, each warm lambda keeps its kernel cached on `globalThis`.
Durable state (messages, memories, events, plans) lives in PostgreSQL,
so cold starts lose nothing that matters. Without Supabase configured,
Eden runs on an in-memory database and the HUD displays
**MEMORY: VOLATILE** so this is never a surprise.

## Desktop and mobile (future)

The Desktop Agent (files, terminal, windows, clipboard, screenshots) and
mobile surfaces (location, camera, quick actions) will connect as event
sources and capability hosts. They speak the same Event Bus vocabulary —
`DeviceConnected`, `LocationChanged`, `ContextChanged` — so nothing in
the core changes when they arrive.
