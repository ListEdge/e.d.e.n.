-- ============================================================
-- Eden — tool-calling support
-- Run this once in the Supabase SQL Editor, before deploying any
-- code from Phase 2 of the tool-calling build onward.
-- Safe to run on a live database: additive only, touches no
-- existing rows.
-- ============================================================

alter table messages drop constraint if exists messages_role_check;
alter table messages add constraint messages_role_check
  check (role in ('user', 'assistant', 'system', 'tool'));

alter table messages add column if not exists tool_call jsonb;
alter table messages add column if not exists tool_call_id text;
