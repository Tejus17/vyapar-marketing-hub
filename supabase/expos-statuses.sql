-- Event statuses: New → Considering → Selected → Going → Went (or Not for us).
-- Run once in Supabase → SQL Editor. Safe to re-run.
alter table hub_events drop constraint if exists hub_events_team_status_check;
update hub_events set team_status = 'considering' where team_status = 'shortlisted';
alter table hub_events add constraint hub_events_team_status_check
  check (team_status in ('new', 'considering', 'selected', 'going', 'went', 'not_for_us'));
