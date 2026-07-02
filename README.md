# Eden — AI Operating System

Eden transforms human intention into completed outcomes.

You state intent. Eden decides how to achieve it. You never need to know
which APIs, software or AI models are involved.

This is v1: the foundation. Every engine, every provider contract, and
the Mission Control interface — built to be extended for the next 20 years.

## What works today

- **The Eden Core** — a living wireframe orb (Three.js) that breathes at
  rest and agitates while Eden thinks.
- **Conversation** — talk to Eden in plain English. Backed by Anthropic,
  OpenAI or Gemini through a swappable AI provider layer.
- **Memory** — say *"remember that..."* and Eden stores it as knowledge,
  then recalls it in future conversations. Persistent when Supabase is
  connected; volatile (and clearly labelled so) when it isn't.
- **Planner** — `POST /api/planner` with a goal; Eden decomposes it into
  tasks and stores the plan.
- **Event Bus** — every engine publishes events; the HUD shows the live
  stream. Full history is persisted for analytics.
- **Permissions** — every action has an authority level. High-risk
  authorities (communicate, deploy, purchase, delete, unlock) create
  approval requests instead of proceeding.
- **Capability registry, presence, scenes, notifications** — all wired
  and event-driven, ready for real signals and devices.

## What's scaffolded for next

Voice, phone calls, email, calendar, home automation, maps, payments,
search, GitHub, and deployments all have complete provider contracts in
`src/providers/`. Implementing one is a single class; no engine changes.

## Quick start

```bash
npm install
cp .env.example .env.local   # add at least one AI key
npm run dev
```

Open http://localhost:3000 and state your intent.

## Deploy

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the click-by-click
GitHub → Vercel → Supabase walkthrough.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The one-paragraph
version: Eden is a **kernel** that boots fourteen **engines**, each with
one responsibility, communicating only through a typed **event bus**, and
touching the outside world only through swappable **provider contracts**.
No engine imports another engine. No business logic knows a vendor's name.
