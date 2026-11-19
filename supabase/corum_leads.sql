-- The Corum landing page: lead capture table
-- Run once in Supabase > SQL Editor > New query > Run

create table if not exists public.corum_leads (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  full_name         text not null check (char_length(full_name) between 2 and 120),
  email             text not null check (char_length(email) <= 254),
  phone             text not null check (char_length(phone) <= 40),
  contact_method    text not null check (contact_method in ('call_text', 'email')),
  investment_amount text not null check (investment_amount in ('75k', '100k', '200k', '300k', '400k', '500k_plus')),
  accredited        text not null check (accredited in ('yes', 'no', 'unsure')),
  source            text default 'corum-landing-page',
  submitted_at      timestamptz,
  user_agent        text
);

-- Lock the table down: the website may ADD leads but can never READ, edit or delete them.
alter table public.corum_leads enable row level security;

drop policy if exists "Landing page can insert leads" on public.corum_leads;
create policy "Landing page can insert leads"
  on public.corum_leads
  for insert
  to anon
  with check (true);

grant insert on table public.corum_leads to anon;

-- Newest leads first when you browse them in the Table Editor
create index if not exists corum_leads_created_at_idx on public.corum_leads (created_at desc);
