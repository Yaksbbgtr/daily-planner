#!/bin/bash
# Puts the cloud side of Daily Planner in place: the database (schema.sql: files, reminders), the reminder job,
# and its every-minute schedule. Safe to run again. Needs the Supabase CLI to be logged in (npx supabase login).
set -euo pipefail
cd "$(dirname "$0")/.."
REF=rpuucdqopfgsiqtqodli
SB="npx -y supabase@2"
# The keys live in this Mac's Keychain, never in the repo.
keys=$(security find-generic-password -s "Daily Planner push keys" -w)
pub=${keys%% *}; priv=${keys##* }
grep -q "$pub" js/config.js || { echo "js/config.js has a different PUSH key than the Keychain."; exit 1; }
cron=$(security find-generic-password -s "Daily Planner cron key" -w 2>/dev/null || true)
if [ -z "$cron" ]; then cron=$(openssl rand -hex 24); security add-generic-password -a planner -s "Daily Planner cron key" -w "$cron"; fi
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
echo "1/3 Database"
$SB db query --linked --project-ref "$REF" -f supabase/schema.sql >/dev/null
cat > "$tmp/config.sql" <<SQL
create extension if not exists pg_cron;
create extension if not exists pg_net;
insert into public.push_config (name, value) values ('vapid_public', '$pub'), ('vapid_private', '$priv'), ('cron_key', '$cron')
on conflict (name) do update set value = excluded.value;
select cron.unschedule(jobid) from cron.job where jobname = 'planner-remind';
select cron.schedule('planner-remind', '* * * * *', \$job\$
  select net.http_post(url := 'https://$REF.supabase.co/functions/v1/remind',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', (select value from public.push_config where name = 'cron_key')),
    body := '{}'::jsonb, timeout_milliseconds := 25000)
\$job\$);
SQL
echo "2/3 Reminder job"
mkdir -p supabase/functions/remind/lib && cp js/reminders.js js/recur.js js/dates.js supabase/functions/remind/lib/
$SB functions deploy remind --project-ref "$REF" --use-api --no-verify-jwt
echo "3/3 Schedule"
$SB db query --linked --project-ref "$REF" -f "$tmp/config.sql" >/dev/null
echo "Done. Reminders and files are set up."
