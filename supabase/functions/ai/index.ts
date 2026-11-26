// Claude for Daily Planner. The app sends what you typed; this turns it into tasks and events and sends them back.
// The Anthropic key is a secret of this function (set by supabase/setup-ai.sh), so it never reaches a phone or the
// repo. Only accounts in ai_allow may use it, each up to DAILY requests a day.
import { createClient } from 'npm:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@1.14.0';
import { betaJSONSchemaOutputFormat } from 'npm:@anthropic-ai/sdk@1.14.0/helpers/beta/json-schema';

const DAILY = 200;
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const KEY = Deno.env.get('ANTHROPIC_API_KEY');
const claude = KEY ? new Anthropic({ apiKey: KEY }) : null;

const ITEMS = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'title', 'date', 'time', 'end', 'star', 'tags', 'notes'],
        properties: {
          kind: { type: 'string', enum: ['task', 'event'] },
          title: { type: 'string' },
          date: { type: ['string', 'null'], description: 'YYYY-MM-DD, or null for a task with no day' },
          time: { type: ['string', 'null'], description: 'HH:MM, 24-hour, or null' },
          end: { type: ['string', 'null'], description: 'HH:MM end time for an event, or null' },
          star: { type: 'boolean' },
          tags: { type: 'array', items: { type: 'string' } },
          notes: { type: 'string' },
        },
      },
    },
  },
} as const;

const SYSTEM = `You turn what someone types into their daily planner into entries for it.
Split the text into separate things to do or to attend. Use "event" for something at a set time with other people or at a place (an appointment, a class, a meeting, a flight); use "task" for something they have to do themselves.
Keep each title short and in their words, without the date or time in it. Work out dates and times from the current date and time you are given; "tonight" is about 20:00, "this morning" about 09:00, "after work" about 18:00. Leave date null for a task with no day mentioned, and time null when no time is meant. Give an event an end time only when one is said or plainly implied.
Set star only when they say it is important or urgent. Use tags only when they write #tag. Put any extra detail they gave (a phone number, an address, what to bring) in notes, else an empty string.
If the text has nothing to add, return an empty list.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer /, '');
  const { data: auth } = await db.auth.getUser(jwt);
  const who = auth?.user?.id;
  if (!who) return reply({ error: 'Sign in first.' }, 401);
  const { data: allowed } = await db.from('ai_allow').select('user_id').eq('user_id', who).maybeSingle();
  if (!allowed) return reply({ error: 'This account cannot use Claude.' }, 403);
  if (!claude) return reply({ error: 'Claude is not set up yet.' }, 503);

  const body = await req.json().catch(() => ({}));
  if (body.ping) return reply({ ok: true });
  const text = String(body.text || '').trim().slice(0, 4000);
  const now = String(body.now || '').slice(0, 40);
  const tz = String(body.tz || 'UTC').slice(0, 64);
  if (!text) return reply({ items: [] });

  // Count this request against today's limit.
  const day = new Date().toISOString().slice(0, 10);
  const { data: use } = await db.from('ai_use').select('n').eq('user_id', who).eq('day', day).maybeSingle();
  if ((use?.n || 0) >= DAILY) return reply({ error: `That is ${DAILY} requests today. Try again tomorrow.` }, 429);
  await db.from('ai_use').upsert({ user_id: who, day, n: (use?.n || 0) + 1 });

  try {
    const msg = await claude.beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: betaJSONSchemaOutputFormat(ITEMS) },
      system: SYSTEM,
      messages: [{ role: 'user', content: `It is now ${now} (${tz}).\n\nThey typed:\n${text}` }],
    });
    if (msg.stop_reason === 'refusal') return reply({ error: 'Claude would not add that.' }, 422);
    if (msg.stop_reason === 'max_tokens' || !msg.parsed_output) return reply({ error: 'Claude could not read that. Try fewer things at once.' }, 502);
    return reply({ items: msg.parsed_output.items });
  } catch (e) {
    console.error(e);
    if (e instanceof Anthropic.AuthenticationError) return reply({ error: 'The Anthropic key was not accepted. Run setup-ai.sh again with a new key.' }, 502);
    if (e instanceof Anthropic.RateLimitError) return reply({ error: 'Claude is busy. Try again in a minute.' }, 503);
    if (e instanceof Anthropic.APIError) return reply({ error: 'Claude is not answering right now.' }, 502);
    return reply({ error: 'Something went wrong.' }, 500);
  }
});
