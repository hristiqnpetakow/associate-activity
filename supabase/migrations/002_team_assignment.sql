alter table public.rooms
  add column if not exists team_assignment_mode text not null default 'RANDOM'
  check (team_assignment_mode in ('RANDOM', 'MANUAL'));

alter table public.players
  add column if not exists team_choice text;

-- Existing projects may have been created before team assignment settings existed.
-- The default keeps their behaviour unchanged: random assignment.
update public.rooms
set team_assignment_mode = 'RANDOM'
where team_assignment_mode is null;
