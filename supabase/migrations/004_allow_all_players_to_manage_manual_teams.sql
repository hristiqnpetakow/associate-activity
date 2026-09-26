-- Ensure every authenticated player who has joined a room can create a team.
-- The previous UI incorrectly limited creation to the calculated team count.

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

drop policy if exists "room_teams_select_member" on public.room_teams;
create policy "room_teams_select_member"
on public.room_teams
for select
to authenticated
using (public.is_room_member(room_id));

drop policy if exists "room_teams_delete_owner" on public.room_teams;
create policy "room_teams_delete_owner"
on public.room_teams
for delete
to authenticated
using (
  (
    created_by = (select auth.uid())
    or exists (
      select 1
      from public.rooms r
      where r.id = room_id
        and r.host_user_id = (select auth.uid())
    )
  )
  and not exists (
    select 1
    from public.players p
    where p.team_choice = id::text
  )
);

grant usage on schema public to authenticated;
grant select, insert, delete on table public.room_teams to authenticated;
