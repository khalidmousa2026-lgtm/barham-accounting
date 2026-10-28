-- برهم: قاعدة بيانات جديدة لحسابات المشاريع فقط
create extension if not exists pgcrypto;
create table if not exists public.barham_projects (
  id uuid primary key default gen_random_uuid(),
  project_name text not null,
  owner_name text not null default '',
  received_amount numeric(14,2) not null default 0 check (received_amount >= 0),
  spent_amount numeric(14,2) not null default 0 check (spent_amount >= 0),
  work_percentage integer not null default 10 check (work_percentage between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.barham_transactions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.barham_projects(id) on delete cascade,
  transaction_type text not null check (transaction_type in ('received','spent')),
  amount numeric(14,2) not null check (amount > 0),
  transaction_date date not null default current_date,
  description text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists barham_transactions_project_date_idx on public.barham_transactions(project_id, transaction_date desc);
-- This starter schema intentionally leaves RLS disabled so setup can be tested simply.
-- Before public deployment, enable authentication and row-level security policies.
