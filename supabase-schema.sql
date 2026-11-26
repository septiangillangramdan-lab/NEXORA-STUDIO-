-- NEXORA STUDIO v1.8.0 Cloud Infrastructure
-- Jalankan sekali di Supabase Dashboard > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.nexora_memories (
  id uuid primary key default gen_random_uuid(),
  agent_name text not null,
  category text not null default 'Catatan',
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nexora_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  agent_name text not null,
  status text not null default 'queued' check (status in ('queued','working','review','approved','revision','completed')),
  details text not null default '',
  project_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nexora_activity_logs (
  id uuid primary key default gen_random_uuid(),
  agent_name text not null default 'System',
  event_type text not null default 'activity',
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.nexora_assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0,
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

alter table public.nexora_memories enable row level security;
alter table public.nexora_tasks enable row level security;
alter table public.nexora_activity_logs enable row level security;
alter table public.nexora_assets enable row level security;

-- Bucket privat. Akses file hanya melalui Netlify Function server-side.
insert into storage.buckets (id, name, public, file_size_limit)
values ('nexora-assets', 'nexora-assets', false, 4194304)
on conflict (id) do update set public = false, file_size_limit = 4194304;

create index if not exists nexora_memories_agent_created_idx on public.nexora_memories(agent_name, created_at desc);
create index if not exists nexora_tasks_status_created_idx on public.nexora_tasks(status, created_at desc);
create index if not exists nexora_logs_created_idx on public.nexora_activity_logs(created_at desc);
