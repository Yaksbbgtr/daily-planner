-- Daily Planner database. Paste all of this into Supabase > SQL Editor and press Run.
-- Safe to run again after changes.

-- Every planner record, one row each. Only its owner can see it.
create table if not exists public.records (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null check (length(id) between 1 and 100),
  u bigint not null,
  body jsonb not null,
  sv bigint not null,
  primary key (user_id, id)
);
create sequence if not exists public.records_sv;
create index if not exists records_user_sv on public.records (user_id, sv);
alter table public.records enable row level security;
drop policy if exists "read own records" on public.records;
create policy "read own records" on public.records for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.records from anon, authenticated;
grant select on public.records to authenticated;

-- Saves changes from a device. The newest change to each record wins, whichever device sends it last.
create or replace function public.push(rows jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); n integer;
begin
  if me is null then raise exception 'not signed in'; end if;
  if jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) > 1000 then raise exception 'bad rows'; end if;
  insert into records (user_id, id, u, body, sv)
  select me, x ->> 'id', (x ->> 'u')::bigint, x, nextval('records_sv')
  from jsonb_array_elements(rows) x
  where jsonb_typeof(x -> 'id') = 'string' and jsonb_typeof(x -> 'u') = 'number' and jsonb_typeof(x -> 'k') = 'string'
    and length(x ->> 'id') between 1 and 100 and length(x::text) < 200000
  on conflict (user_id, id) do update set u = excluded.u, body = excluded.body, sv = excluded.sv
    where excluded.u > records.u or (excluded.u = records.u and excluded.body::text > records.body::text);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.push(jsonb) from public, anon;
grant execute on function public.push(jsonb) to authenticated;

-- Apple Calendar events, sent by the helper on the Mac.
create table if not exists public.apple (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null,
  updated timestamptz not null default now()
);
alter table public.apple enable row level security;
drop policy if exists "read own apple" on public.apple;
create policy "read own apple" on public.apple for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.apple from anon, authenticated;
grant select on public.apple to authenticated;

-- The Mac helper signs in with a key made in the app's settings. Only a hash of it is stored.
create table if not exists public.feed_keys (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$')
);
alter table public.feed_keys enable row level security;
drop policy if exists "own key" on public.feed_keys;
create policy "own key" on public.feed_keys for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.feed_keys to authenticated;

create or replace function public.put_apple(key text, data jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare who uuid;
begin
  select user_id into who from feed_keys where key_hash = encode(sha256(convert_to(key, 'UTF8')), 'hex');
  if who is null then raise exception 'unknown key'; end if;
  if jsonb_typeof(data -> 'events') <> 'array' or length(data::text) > 5000000 then raise exception 'bad data'; end if;
  insert into apple (user_id, data, updated) values (who, data, now())
  on conflict (user_id) do update set data = excluded.data, updated = now();
end $$;
revoke all on function public.put_apple(text, jsonb) from public;
grant execute on function public.put_apple(text, jsonb) to anon, authenticated;

-- Live updates between devices.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'records') then
    alter publication supabase_realtime add table public.records;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'apple') then
    alter publication supabase_realtime add table public.apple;
  end if;
end $$;
