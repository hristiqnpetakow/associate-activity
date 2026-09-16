create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  host_user_id uuid not null references auth.users(id) on delete restrict,
  team_size smallint not null check (team_size in (2, 3)),
  status text not null default 'LOBBY' check (status in ('LOBBY', 'WORD_INPUT', 'PLAYING', 'PAUSED', 'FINISHED')),
  game_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 24),
  is_host boolean not null default false,
  ready boolean not null default false,
  words jsonb,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique(room_id, user_id),
  unique(room_id, name)
);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null unique references public.rooms(id) on delete cascade,
  state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.games enable row level security;

create or replace function public.is_room_member(target_room uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.players p
    where p.room_id = target_room and p.user_id = auth.uid()
  ) or exists (
    select 1 from public.rooms r
    where r.id = target_room and r.host_user_id = auth.uid()
  );
$$;

drop policy if exists "rooms_select_member" on public.rooms;
create policy "rooms_select_member"
on public.rooms for select
to authenticated
using (public.is_room_member(id));

drop policy if exists "rooms_insert_host" on public.rooms;
create policy "rooms_insert_host"
on public.rooms for insert
to authenticated
with check (host_user_id = auth.uid());

drop policy if exists "rooms_update_host" on public.rooms;
create policy "rooms_update_host"
on public.rooms for update
to authenticated
using (host_user_id = auth.uid())
with check (host_user_id = auth.uid());

-- Players can see everyone in a room they joined.
drop policy if exists "players_select_member" on public.players;
create policy "players_select_member"
on public.players for select
to authenticated
using (public.is_room_member(room_id));

drop policy if exists "players_insert_self" on public.players;
create policy "players_insert_self"
on public.players for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "players_update_self" on public.players;
create policy "players_update_self"
on public.players for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "players_delete_self" on public.players;
create policy "players_delete_self"
on public.players for delete
to authenticated
using (user_id = auth.uid());

-- Any member can write a game state snapshot. The UI only exposes legal actions;
-- the SQL layer ensures the caller is at least a member of the same room.
drop policy if exists "games_select_member" on public.games;
create policy "games_select_member"
on public.games for select
to authenticated
using (public.is_room_member(room_id));

drop policy if exists "games_insert_member" on public.games;
create policy "games_insert_member"
on public.games for insert
to authenticated
with check (public.is_room_member(room_id));

drop policy if exists "games_update_member" on public.games;
create policy "games_update_member"
on public.games for update
to authenticated
using (public.is_room_member(room_id))
with check (public.is_room_member(room_id));

create index if not exists players_room_id_idx on public.players(room_id);
create index if not exists players_user_id_idx on public.players(user_id);
create index if not exists rooms_code_idx on public.rooms(code);

-- Secure room-code lookup used before a player has joined the room.
create or replace function public.get_room_by_code(p_code text)
returns public.rooms
language sql
stable
security definer
set search_path = public
as $$
  select r.* from public.rooms r where r.code = upper(trim(p_code)) limit 1;
$$;

grant execute on function public.get_room_by_code(text) to authenticated;

-- Realtime subscriptions. Run once per project.
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.players;
alter publication supabase_realtime add table public.games;
