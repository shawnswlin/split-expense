-- Run this once in the Supabase SQL Editor (Project > SQL Editor > New query > Run).

create table trips (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table extra_participants (
  id text primary key,
  trip_id text not null references trips(id) on delete cascade,
  name text not null
);

create table expenses (
  id text primary key,
  trip_id text not null references trips(id) on delete cascade,
  title text,
  payer_id text not null,
  total_amount numeric not null,
  split_type text not null check (split_type in ('equal', 'custom')),
  shares jsonb not null,
  created_at timestamptz not null default now()
);

-- Each row tracks whether one participant has paid back their share of one
-- specific expense (not netted against other expenses in the trip).
create table expense_settlements (
  expense_id text not null references expenses(id) on delete cascade,
  participant_id text not null,
  paid boolean not null default false,
  primary key (expense_id, participant_id)
);

-- Human-readable log of what changed and when (no accounts, so not "who").
create table activity_log (
  id bigint generated always as identity primary key,
  trip_id text not null references trips(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);

-- No login/accounts by design (see README) — anyone with the anon public key
-- (which ships in the app's client-side JS, as intended by Supabase) can
-- read and write. That's an accepted trade-off for this low-stakes,
-- friends-only use case.
alter table trips enable row level security;
alter table extra_participants enable row level security;
alter table expenses enable row level security;
alter table expense_settlements enable row level security;
alter table activity_log enable row level security;

create policy "public read/write trips" on trips for all using (true) with check (true);
create policy "public read/write extra_participants" on extra_participants for all using (true) with check (true);
create policy "public read/write expenses" on expenses for all using (true) with check (true);
create policy "public read/write expense_settlements" on expense_settlements for all using (true) with check (true);
create policy "public read/write activity_log" on activity_log for all using (true) with check (true);

-- Enables live sync across everyone viewing the same trip.
alter publication supabase_realtime add table expenses;
alter publication supabase_realtime add table extra_participants;
alter publication supabase_realtime add table expense_settlements;
alter publication supabase_realtime add table activity_log;
