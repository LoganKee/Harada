-- Harada Friends v1: run once in Supabase SQL Editor.
-- Privacy: only explicitly shared goals are uploaded. Existing local history stays on device.
create table if not exists public.harada_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  created_at timestamptz not null default now()
);
create table if not exists public.harada_friendships (
  id bigint generated always as identity primary key,
  requester uuid not null references auth.users(id) on delete cascade,
  recipient uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  unique (requester, recipient),
  check (requester <> recipient)
);
create table if not exists public.harada_shared_goals (
  owner_id uuid not null references auth.users(id) on delete cascade,
  goal_id text not null,
  goal_name text not null,
  category text not null,
  frequency text not null,
  progress numeric not null default 0,
  target numeric not null default 1,
  unit text not null default '',
  mode text not null default 'reach',
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (owner_id, goal_id)
);
create table if not exists public.harada_nudges (
  id bigint generated always as identity primary key,
  sender uuid not null references auth.users(id) on delete cascade,
  recipient uuid not null references auth.users(id) on delete cascade,
  goal_id text not null,
  goal_name text not null,
  sent_on date not null default (now() at time zone 'utc')::date,
  created_at timestamptz not null default now(),
  unique(sender,recipient,goal_id,sent_on),
  check(sender <> recipient)
);
create index if not exists harada_friendships_recipient_idx on public.harada_friendships(recipient);
create index if not exists harada_nudges_recipient_idx on public.harada_nudges(recipient,created_at desc);
alter table public.harada_profiles enable row level security;
alter table public.harada_friendships enable row level security;
alter table public.harada_shared_goals enable row level security;
alter table public.harada_nudges enable row level security;

-- Do not expose a public user directory. Profiles can be viewed only by the owner
-- or people with whom the owner has an existing friend request/connection.
create policy "profile owner reads" on public.harada_profiles for select to authenticated using (id=auth.uid());
create policy "connected profiles read" on public.harada_profiles for select to authenticated using (
  exists(select 1 from public.harada_friendships f where
    (f.requester=auth.uid() and f.recipient=harada_profiles.id) or (f.recipient=auth.uid() and f.requester=harada_profiles.id))
);
create policy "profile owner creates" on public.harada_profiles for insert to authenticated with check (id=auth.uid());
create policy "profile owner edits" on public.harada_profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());

create policy "friendship participants read" on public.harada_friendships for select to authenticated using (requester=auth.uid() or recipient=auth.uid());
create policy "friendship sender creates" on public.harada_friendships for insert to authenticated with check (requester=auth.uid() and status='pending');
create policy "friendship recipient responds" on public.harada_friendships for update to authenticated using (recipient=auth.uid() and status='pending') with check (recipient=auth.uid() and status in ('accepted','declined'));
create policy "friendship participants delete" on public.harada_friendships for delete to authenticated using (requester=auth.uid() or recipient=auth.uid());

create policy "owner or accepted friends see shared goals" on public.harada_shared_goals for select to authenticated using (
 owner_id=auth.uid() or exists(select 1 from public.harada_friendships f where f.status='accepted' and
 ((f.requester=auth.uid() and f.recipient=owner_id) or (f.recipient=auth.uid() and f.requester=owner_id)))
);
create policy "owner shares goals" on public.harada_shared_goals for insert to authenticated with check (owner_id=auth.uid());
create policy "owner updates shared goals" on public.harada_shared_goals for update to authenticated using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "owner removes shared goals" on public.harada_shared_goals for delete to authenticated using (owner_id=auth.uid());

create policy "nudge participants read" on public.harada_nudges for select to authenticated using (sender=auth.uid() or recipient=auth.uid());
create policy "friends can nudge shared goals" on public.harada_nudges for insert to authenticated with check (
 sender=auth.uid() and
 exists(select 1 from public.harada_friendships f where f.status='accepted' and
 ((f.requester=sender and f.recipient=recipient) or (f.recipient=sender and f.requester=recipient))) and
 exists(select 1 from public.harada_shared_goals g where g.owner_id=recipient and g.goal_id=harada_nudges.goal_id and g.goal_name=harada_nudges.goal_name and not g.completed)
);

-- Prevent authenticated clients from editing friendships' requester/recipient,
-- or nudges after creation. The public role receives no access.
revoke all on public.harada_profiles, public.harada_friendships, public.harada_shared_goals, public.harada_nudges from anon;
revoke all on public.harada_profiles, public.harada_friendships, public.harada_shared_goals, public.harada_nudges from authenticated;
grant select, insert, update(display_name) on public.harada_profiles to authenticated;
grant select, insert, update(status), delete on public.harada_friendships to authenticated;
grant select, insert, update, delete on public.harada_shared_goals to authenticated;
grant select, insert on public.harada_nudges to authenticated;
grant usage, select on sequence public.harada_friendships_id_seq to authenticated;
grant usage, select on sequence public.harada_nudges_id_seq to authenticated;
