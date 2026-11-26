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

-- Email to tasks: a script in your own Google account sends new emails here with its own key.
create table if not exists public.mail_keys (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$')
);
alter table public.mail_keys enable row level security;
drop policy if exists "own mail key" on public.mail_keys;
create policy "own mail key" on public.mail_keys for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.mail_keys to authenticated;
-- One key per Gmail account, so several accounts can send to the same planner.
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'mail_keys_pkey' and pg_get_constraintdef(oid) like '%(user_id)%') then
    alter table public.mail_keys drop constraint mail_keys_pkey;
    alter table public.mail_keys add primary key (key_hash);
  end if;
end $$;
alter table public.mail_keys add column if not exists made timestamptz not null default now();

-- Only emails that ask you to do something become tasks: assignments, due dates, forms to fill in.
-- Codes, receipts, sales, newsletters, grade notices and plain conversation are left in Gmail.
create or replace function public.mail_is_task(title text, notes text) returns boolean
language sql immutable set search_path = public as $$
  select case
    when coalesce(title, '') || ' ' || left(coalesce(notes, ''), 1500) ~* '(verification code|security (alert|code)|sign[- ]?in (attempt|code|alert)|new sign[- ]?in|password reset|reset your password|one[- ]time (code|password)|\mreceipt\M|your order|order (confirmed|confirmation)|has shipped|out for delivery|\mdelivered\M|newsletter|webinar|\d+% off|\msale\M|unsubscribe|has been graded|grades? (has been |have been )?(posted|released|updated)|submission (received|confirmed|successful)|you submitted|successfully submitted|thanks for submitting)'
      then false
    else coalesce(title, '') || ' ' || left(coalesce(notes, ''), 1500) ~* '(\m(assignments?|homework|hw\d*|due|deadlines?|submit|submissions?|quiz(zes)?|exams?|midterms?|final exam|essays?|papers? (is|are) due|lab reports?|discussion (post|board|reply)|worksheets?|turn in|to[- ]?do|action (required|needed)|rsvp|sign[- ]up|register by|fill out|reminder)\M|please (complete|review|sign|fill|submit|respond|reply|confirm|register|send|upload|read))'
  end
$$;

-- Each email becomes one task. Only a title, notes and a link are taken; the task id comes from the
-- email's id, so the same email never makes two tasks, and a task you delete stays deleted.
create or replace function public.add_mail(key text, mails jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare who uuid; n integer;
begin
  select user_id into who from mail_keys where key_hash = encode(sha256(convert_to(key, 'UTF8')), 'hex');
  if who is null then raise exception 'unknown key'; end if;
  if jsonb_typeof(mails) <> 'array' or jsonb_array_length(mails) > 100 then raise exception 'bad mails'; end if;
  insert into records (user_id, id, u, body, sv)
  select who, 'mail:' || (m ->> 'id'), (m ->> 'at')::bigint,
    jsonb_build_object('id', 'mail:' || (m ->> 'id'), 'k', 'task', 'u', (m ->> 'at')::bigint, 'made', (m ->> 'at')::bigint,
      'title', left(coalesce(nullif(trim(m ->> 'title'), ''), '(no subject)'), 300), 'notes', left(coalesce(m ->> 'notes', ''), 2000),
      'mail', left(coalesce(m ->> 'link', ''), 300), 'tags', jsonb_build_array('email'), 'date', null, 'done', null),
    nextval('records_sv')
  from jsonb_array_elements(mails) m
  where coalesce(m ->> 'id', '') ~ '^[A-Za-z0-9_-]{1,64}$' and jsonb_typeof(m -> 'at') = 'number'
    and mail_is_task(m ->> 'title', m ->> 'notes')
  on conflict (user_id, id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.add_mail(text, jsonb) from public;
grant execute on function public.add_mail(text, jsonb) to anon, authenticated;

-- Home Screen widget: a widget on the phone reads today's plan with its own read-only key.
create table if not exists public.widget_keys (
  key_hash text primary key check (key_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  made timestamptz not null default now()
);
alter table public.widget_keys enable row level security;
drop policy if exists "own widget key" on public.widget_keys;
create policy "own widget key" on public.widget_keys for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.widget_keys to authenticated;

-- Only what the widget shows: open tasks due soon, events, and Apple events near today.
create or replace function public.widget_data(key text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare who uuid; lo text := to_char(now() - interval '2 days', 'YYYY-MM-DD'); hi text := to_char(now() + interval '3 days', 'YYYY-MM-DD');
begin
  select user_id into who from widget_keys where key_hash = encode(sha256(convert_to(key, 'UTF8')), 'hex');
  if who is null then raise exception 'unknown key'; end if;
  return jsonb_build_object(
    'tasks', coalesce((select jsonb_agg(jsonb_build_object('id', body -> 'id', 'title', body -> 'title', 'date', body -> 'date', 'time', body -> 'time', 'star', body -> 'star') order by body ->> 'date', body ->> 'time')
      from (select body from records where user_id = who and body ->> 'k' = 'task' and (body ->> 'del') is distinct from 'true'
        and body ->> 'done' is null and body ->> 'date' <= hi order by body ->> 'date' desc limit 80) t), '[]'),
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', body -> 'id', 'title', body -> 'title', 'date', body -> 'date', 'endDate', body -> 'endDate', 'time', body -> 'time', 'end', body -> 'end', 'rule', body -> 'rule', 'color', body -> 'color'))
      from records where user_id = who and body ->> 'k' = 'event' and (body ->> 'del') is distinct from 'true' and body ->> 'date' <= hi
        and (body ->> 'rule' is not null or coalesce(body ->> 'endDate', body ->> 'date') >= lo)), '[]'),
    'apple', coalesce((select jsonb_agg(e) from apple a, jsonb_array_elements(a.data -> 'events') e
      where a.user_id = who and case when e ->> 'day' is not null then e ->> 'day' <= hi and coalesce(e ->> 'endDay', e ->> 'day') >= lo
        else (e ->> 's')::bigint < extract(epoch from now() + interval '3 days') and (e ->> 'e')::bigint > extract(epoch from now() - interval '2 days') end), '[]'),
    'hide', coalesce((select body -> 'hideCals' from records where user_id = who and id = 'settings'), '[]'));
end $$;
revoke all on function public.widget_data(text) from public;
grant execute on function public.widget_data(text) to anon, authenticated;

-- Photos and files added to projects: a private folder per person (files/<user id>/...), only theirs to read or change.
insert into storage.buckets (id, name, public, file_size_limit) values ('files', 'files', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;
drop policy if exists "own files read" on storage.objects;
create policy "own files read" on storage.objects for select to authenticated using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "own files add" on storage.objects;
create policy "own files add" on storage.objects for insert to authenticated with check (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "own files change" on storage.objects;
create policy "own files change" on storage.objects for update to authenticated using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "own files remove" on storage.objects;
create policy "own files remove" on storage.objects for delete to authenticated using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);

-- Reminders: each device that turns them on saves its push address here, with its time zone.
create table if not exists public.push_subs (
  endpoint text primary key check (endpoint ~ '^https://' and length(endpoint) < 1000),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  sub jsonb not null check (length(sub::text) < 4000),
  tz text not null default 'UTC' check (length(tz) < 64),
  made timestamptz not null default now()
);
alter table public.push_subs enable row level security;
drop policy if exists "own push" on public.push_subs;
create policy "own push" on public.push_subs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.push_subs to authenticated;
-- What was already sent, so nothing rings twice. Only the reminder job reads it.
create table if not exists public.push_sent (
  user_id uuid not null references auth.users on delete cascade,
  key text not null,
  made timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.push_sent enable row level security;
revoke all on public.push_sent from anon, authenticated;
-- The job's own settings (signing key, the key the scheduler uses to call it). Nobody else can read them.
create table if not exists public.push_config (name text primary key, value text not null);
alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;
-- What the job needs for one person: settings, open tasks near today, and events that could fall near today.
create or replace function public.remind_items(who uuid, lo text, hi text) returns setof jsonb
language sql stable security definer set search_path = public as $$
  select body from records where user_id = who and body ->> 'del' is null and (
    id in ('settings', 'tfplan')
    or (body ->> 'k' = 'tefillin' and body ->> 'day' between lo and hi)
    or (body ->> 'k' = 'task' and body ->> 'done' is null and body ->> 'date' between lo and hi)
    or (body ->> 'k' = 'event' and body ->> 'date' <= hi and (jsonb_typeof(body -> 'rule') = 'object' or coalesce(body ->> 'endDate', body ->> 'date') >= lo)))
$$;
revoke all on function public.remind_items(uuid, text, text) from public, anon, authenticated;
grant execute on function public.remind_items(uuid, text, text) to service_role;
