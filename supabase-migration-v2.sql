-- NEXORA STUDIO v2.0.0 — Autonomous Multi-Agent Collaboration (Tahap 1)
-- Jalankan SEKALI di Supabase Dashboard > SQL Editor. Aman dijalankan ulang.
-- Tidak menghapus tabel/data v1.8–v1.9. Hanya menambah kolom dan tabel baru.

create extension if not exists pgcrypto;

-- 1) Project / brief produksi
create table if not exists public.nexora_projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  brief text not null default '',
  status text not null default 'active'
    check (status in ('active','awaiting_approval','completed','cancelled')),
  approval_mode text not null default 'manual' check (approval_mode in ('manual','auto')),
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) Perluasan tabel task yang sudah ada
alter table public.nexora_tasks add column if not exists idempotency_key text;
alter table public.nexora_tasks add column if not exists step_key text;
alter table public.nexora_tasks add column if not exists step_order int not null default 0;
alter table public.nexora_tasks add column if not exists retry_count int not null default 0;
alter table public.nexora_tasks add column if not exists max_retries int not null default 2;
alter table public.nexora_tasks add column if not exists revision_count int not null default 0;
alter table public.nexora_tasks add column if not exists requires_approval boolean not null default false;
alter table public.nexora_tasks add column if not exists result text;
alter table public.nexora_tasks add column if not exists error text;
alter table public.nexora_tasks add column if not exists started_at timestamptz;
alter table public.nexora_tasks add column if not exists finished_at timestamptz;

create unique index if not exists nexora_tasks_idem_uidx on public.nexora_tasks(idempotency_key);
create index if not exists nexora_tasks_project_idx on public.nexora_tasks(project_id, step_order);

-- Status baru: blocked, awaiting_approval, failed (status lama tetap valid)
alter table public.nexora_tasks drop constraint if exists nexora_tasks_status_check;
alter table public.nexora_tasks drop constraint if exists nexora_tasks_status_v2_check;
alter table public.nexora_tasks add constraint nexora_tasks_status_v2_check
  check (status in ('queued','blocked','working','review','awaiting_approval','approved','revision','completed','failed'));

-- 3) Dependensi task
create table if not exists public.nexora_task_dependencies (
  task_id uuid not null references public.nexora_tasks(id) on delete cascade,
  depends_on uuid not null references public.nexora_tasks(id) on delete cascade,
  primary key (task_id, depends_on),
  check (task_id <> depends_on)
);
create index if not exists nexora_task_deps_on_idx on public.nexora_task_dependencies(depends_on);

-- 4) Pesan antar-Agent (Agent Discussion Room)
create table if not exists public.nexora_agent_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.nexora_projects(id) on delete cascade,
  task_id uuid references public.nexora_tasks(id) on delete set null,
  sender text not null,
  recipients text[] not null default '{}',
  kind text not null default 'note'
    check (kind in ('note','question','answer','result','revision_request','decision','system')),
  body text not null,
  status text not null default 'delivered' check (status in ('pending','delivered','read','failed')),
  output_ref text,
  idempotency_key text unique,
  created_at timestamptz not null default now()
);
create index if not exists nexora_messages_project_idx on public.nexora_agent_messages(project_id, created_at);

-- 5) Eksekusi Agent (riwayat tiap percobaan)
create table if not exists public.nexora_agent_runs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.nexora_tasks(id) on delete cascade,
  agent_name text not null,
  attempt int not null default 1,
  status text not null default 'running' check (status in ('running','succeeded','failed')),
  executing boolean not null default false,
  model text,
  output text,
  error text,
  tokens jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists nexora_runs_task_idx on public.nexora_agent_runs(task_id, started_at desc);
create index if not exists nexora_runs_started_idx on public.nexora_agent_runs(started_at desc);

-- 6) Persetujuan CEO
create table if not exists public.nexora_approvals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.nexora_projects(id) on delete cascade,
  task_id uuid references public.nexora_tasks(id) on delete cascade,
  title text not null,
  details text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists nexora_approvals_project_idx on public.nexora_approvals(project_id, status);

-- RLS aktif; akses hanya lewat Netlify Function (service role)
alter table public.nexora_projects enable row level security;
alter table public.nexora_task_dependencies enable row level security;
alter table public.nexora_agent_messages enable row level security;
alter table public.nexora_agent_runs enable row level security;
alter table public.nexora_approvals enable row level security;
