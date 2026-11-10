-- Run in Supabase SQL Editor. Does not change existing Friends data.
create table if not exists public.harada_push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists harada_push_user_idx on public.harada_push_subscriptions(user_id);
alter table public.harada_push_subscriptions enable row level security;
revoke all on public.harada_push_subscriptions from anon, authenticated;
grant select,insert,update,delete on public.harada_push_subscriptions to authenticated;
grant usage,select on sequence public.harada_push_subscriptions_id_seq to authenticated;
drop policy if exists "push owner select" on public.harada_push_subscriptions;
drop policy if exists "push owner insert" on public.harada_push_subscriptions;
drop policy if exists "push owner update" on public.harada_push_subscriptions;
drop policy if exists "push owner delete" on public.harada_push_subscriptions;
create policy "push owner select" on public.harada_push_subscriptions for select to authenticated using (user_id=auth.uid());
create policy "push owner insert" on public.harada_push_subscriptions for insert to authenticated with check (user_id=auth.uid());
create policy "push owner update" on public.harada_push_subscriptions for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "push owner delete" on public.harada_push_subscriptions for delete to authenticated using (user_id=auth.uid());
-- Prevent account ownership changes when updating existing subscriptions.
revoke update on public.harada_push_subscriptions from authenticated;
grant update(p256dh,auth,user_agent,updated_at) on public.harada_push_subscriptions to authenticated;

-- One delivery attempt per nudge, preventing repeat notifications on retries.
create table if not exists public.harada_push_deliveries (nudge_id bigint primary key references public.harada_nudges(id) on delete cascade,created_at timestamptz not null default now());
alter table public.harada_push_deliveries enable row level security;
revoke all on public.harada_push_deliveries from anon,authenticated;
