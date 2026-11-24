// A throwaway Postgres (PGlite, in memory) set up like a Supabase project, with supabase/schema.sql loaded.
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const BASICS = `
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
grant usage on schema auth, public to anon, authenticated;
grant execute on all functions in schema auth to anon, authenticated;
create publication supabase_realtime;
create role service_role nologin;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema storage to authenticated; grant all on storage.objects to authenticated;`;

export async function makeDb() {
  const db = new PGlite();
  await db.exec(BASICS);
  const schema = fs.readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  await db.exec(schema);
  await db.exec(schema); // running it twice must work
  return db;
}
let n = 0;
export async function user(db, email) {
  const u = { id: '00000000-0000-4000-8000-' + String(++n).padStart(12, '0'), email };
  await db.query('insert into auth.users (id) values ($1)', [u.id]);
  return u;
}
// One query as a signed-in user (or anon when user is null), the way the Supabase API runs it.
export function as(db, u, sql, params = []) {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(u ? { sub: u.id, role: 'authenticated' } : { role: 'anon' })]);
    await tx.exec('set local role ' + (u ? 'authenticated' : 'anon'));
    return tx.query(sql, params);
  });
}
