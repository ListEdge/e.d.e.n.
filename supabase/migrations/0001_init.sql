-- ============================================================
-- Eden v1 — initial schema
-- Run this once in the Supabase SQL Editor.
-- ============================================================

create extension if not exists "pgcrypto";

-- ── Conversations & messages ────────────────────────────────
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  title text,
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  provider text,
  model text,
  created_at timestamptz not null default now()
);
create index if not exists idx_messages_conversation on messages(conversation_id, created_at);

-- ── Memory (knowledge, not chat logs) ───────────────────────
create table if not exists memories (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in (
    'conversation','knowledge','long_term','semantic',
    'preference','goal','project','relationship','business'
  )),
  content text not null,
  importance int not null default 1 check (importance between 1 and 5),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists idx_memories_type on memories(type);
create index if not exists idx_memories_content on memories using gin (to_tsvector('english', content));

-- Future semantic recall: enable the vector extension and add an
-- embedding column. The MemoryRepo interface will not need to change.
-- create extension if not exists vector;
-- alter table memories add column if not exists embedding vector(1536);

-- ── Event history ───────────────────────────────────────────
create table if not exists events (
  id uuid primary key,
  type text not null,
  source text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists idx_events_type on events(type, created_at);

-- ── Knowledge graph ─────────────────────────────────────────
create table if not exists entities (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  name text not null,
  attributes jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists idx_entities_name on entities(lower(name));

create table if not exists relationships (
  id uuid primary key default gen_random_uuid(),
  from_entity uuid not null references entities(id) on delete cascade,
  to_entity uuid not null references entities(id) on delete cascade,
  kind text not null,
  attributes jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists idx_relationships_from on relationships(from_entity);
create index if not exists idx_relationships_to on relationships(to_entity);

-- ── Planning ────────────────────────────────────────────────
create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'active' check (status in ('active','paused','done','abandoned')),
  created_at timestamptz not null default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid references goals(id) on delete cascade,
  title text not null,
  status text not null default 'todo' check (status in ('todo','in_progress','blocked','done')),
  complexity int not null default 2 check (complexity between 1 and 5),
  depends_on uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists idx_tasks_goal on tasks(goal_id);

-- ── Notifications & approvals ───────────────────────────────
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  level text not null default 'info' check (level in ('info','warning','critical')),
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists approvals (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  authority text not null check (authority in ('read','write','communicate','deploy','purchase','delete','unlock')),
  status text not null default 'pending' check (status in ('pending','approved','denied')),
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- ── Preferences ─────────────────────────────────────────────
create table if not exists preferences (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ── Row Level Security ──────────────────────────────────────
-- Eden's server talks to the database with the service-role key, which
-- bypasses RLS. Enabling RLS with no public policies means the anon key
-- cannot read or write anything — the safest default for a personal OS.
alter table conversations enable row level security;
alter table messages enable row level security;
alter table memories enable row level security;
alter table events enable row level security;
alter table entities enable row level security;
alter table relationships enable row level security;
alter table goals enable row level security;
alter table tasks enable row level security;
alter table notifications enable row level security;
alter table approvals enable row level security;
alter table preferences enable row level security;
