#!/bin/bash
# Turns on Claude in Daily Planner: saves your Anthropic API key as a secret of the cloud function (never in the
# repo or on your phone), lets the accounts that exist now use it, and puts the function in place. Safe to run
# again, e.g. with a new key. Run it yourself in Terminal, since it asks for the key: ./supabase/setup-ai.sh
set -euo pipefail
cd "$(dirname "$0")/.."
REF=rpuucdqopfgsiqtqodli
SB="npx -y supabase@2"
printf 'Paste your Anthropic API key (it will not show): '
read -rs key; echo
case "$key" in sk-ant-*) ;; *) echo "That does not look like an Anthropic API key (they start with sk-ant-)."; exit 1;; esac
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
umask 077
printf 'ANTHROPIC_API_KEY=%s\n' "$key" > "$tmp/env"
echo "1/3 Database"
$SB db query --linked --project-ref "$REF" -f supabase/schema.sql >/dev/null
echo "insert into public.ai_allow (user_id) select id from auth.users on conflict do nothing;" > "$tmp/allow.sql"
$SB db query --linked --project-ref "$REF" -f "$tmp/allow.sql" >/dev/null
echo "2/3 Key"
$SB secrets set --project-ref "$REF" --env-file "$tmp/env" >/dev/null
echo "3/3 Claude function"
$SB functions deploy ai --project-ref "$REF" --use-api --no-verify-jwt
echo "Done. Claude is on for the accounts that exist now."
