create table if not exists public.room_teams (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 20),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (room_id, name)
);

alter table public.room_teams enable row level security;

grant usage on schema public to authenticated;
grant select, insert, delete on table public.room_teams to authenticated;

drop policy if exists "room_teams_select_member" on public.room_teams;
create policy "room_teams_select_member"
on public.room_teams
for select
to authenticated
using (public.is_room_member(room_id));

drop policy if exists "room_teams_insert_member" on public.room_teams;
create policy "room_teams_insert_member"
on public.room_teams
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and public.is_room_member(room_id)
  and exists (
    select 1
    from public.rooms r
    where r.id = room_id
      and r.team_assignment_mode = 'MANUAL'
  )
);

drop policy if exists "room_teams_delete_owner" on public.room_teams;
create policy "room_teams_delete_owner"
on public.room_teams
for delete
to authenticated
using (
  (created_by = (select auth.uid()) or exists (
    select 1 from public.rooms r
    where r.id = room_id and r.host_user_id = (select auth.uid())
  ))
  and not exists (
    select 1 from public.players p
    where p.team_choice = id::text
  )
);

-- Old MANUAL team_choice values (team-1, team-2...) belong to the previous UI.
-- Clear them so the new room-team IDs can be selected cleanly.
update public.players p
set team_choice = null
where exists (
  select 1 from public.rooms r
  where r.id = p.room_id
    and r.team_assignment_mode = 'MANUAL'
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'room_teams'
  ) then
    alter publication supabase_realtime add table public.room_teams;
  end if;
end $$;
