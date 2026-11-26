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

const N = (t: string) => ({ type: [t, 'null'] });
const ASSIST = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'actions'],
  properties: {
    reply: { type: 'string', description: 'What to tell them: short, plain, friendly' },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['op', 'id', 'kind', 'title', 'date', 'time', 'end', 'dur', 'star', 'notes', 'steps', 'proj'],
        properties: {
          op: { type: 'string', enum: ['add', 'update', 'done'] },
          id: { ...N('string'), description: 'For update and done: the id from the planner. Null for add.' },
          kind: { type: 'string', enum: ['task', 'event'] },
          title: N('string'),
          date: { ...N('string'), description: 'YYYY-MM-DD' },
          time: { ...N('string'), description: 'HH:MM 24-hour' },
          end: { ...N('string'), description: 'HH:MM 24-hour, events only' },
          dur: { ...N('integer'), description: 'Minutes a task takes' },
          star: N('boolean'),
          notes: N('string'),
          steps: { type: ['array', 'null'], items: { type: 'string' }, description: 'Subtasks for a task' },
          proj: { ...N('string'), description: 'Project id' },
        },
      },
    },
  },
} as const;
const STEPS = {
  type: 'object',
  additionalProperties: false,
  required: ['steps', 'minutes'],
  properties: {
    steps: { type: 'array', items: { type: 'string' } },
    minutes: { ...N('integer'), description: 'About how long the whole task takes, or null if it is unclear' },
  },
} as const;

const ASSIST_SYSTEM = `You are the assistant inside someone's personal Daily Planner app: their tasks, calendar, projects and notes. They are an observant Jew; the planner knows Shabbos and Yom Tov (restDays), and nothing should be scheduled on those days.
You get a snapshot of their planner as JSON and what they asked. Answer questions from the snapshot, and when they want something changed, propose it as actions:
- add: a new task or event (kind, title, and whatever date/time/end/dur/star/notes/steps/proj apply; null for the rest).
- update: change an existing item by its id; give only the fields that change and null for the rest. You cannot clear a date or time, only set one.
- done: mark a task finished by its id.
Never invent ids; use only ids from the snapshot. Do not change things they did not ask about. When planning a day, put tasks into free time between events, leave short breaks, respect how long tasks take (dur, about 30 minutes if unknown), and do not plan in the past.
In reply, say briefly what you suggest or the answer, in plain words. Times like 3:30 PM, days like "Thursday". No markdown headings or tables; short lines or a short list are fine. If they asked for nothing to change, return no actions.`;

const STEPS_SYSTEM = `Break a task from someone's planner into the concrete steps to get it done: usually 3 to 7, each a short action starting with a verb, in order. Do not pad with obvious steps. Also estimate how many minutes the whole task takes, or null if you cannot tell.`;

async function ask(system: string, schema: Record<string, unknown>, content: string, history: { role: 'user' | 'assistant'; content: string }[] = []) {
  const msg = await claude!.beta.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: betaJSONSchemaOutputFormat(schema as typeof ITEMS) },
    system,
    messages: [...history, { role: 'user', content }],
  });
  if (msg.stop_reason === 'refusal') throw new Say('Claude would not do that.', 422);
  if (msg.stop_reason === 'max_tokens' || !msg.parsed_output) throw new Say('Claude could not finish that. Try asking for less at once.', 502);
  return msg.parsed_output as unknown;
}
class Say extends Error { constructor(m: string, public status: number) { super(m); } }

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
  const mode = ['assist', 'steps'].includes(body.mode) ? body.mode : 'add';
  if (!text && mode !== 'steps') return reply(mode === 'assist' ? { reply: '', actions: [] } : { items: [] });

  // Count this request against today's limit.
  const day = new Date().toISOString().slice(0, 10);
  const { data: use } = await db.from('ai_use').select('n').eq('user_id', who).eq('day', day).maybeSingle();
  if ((use?.n || 0) >= DAILY) return reply({ error: `That is ${DAILY} requests today. Try again tomorrow.` }, 429);
  await db.from('ai_use').upsert({ user_id: who, day, n: (use?.n || 0) + 1 });

  try {
    if (mode === 'steps') {
      const task = JSON.stringify(body.task || {}).slice(0, 6000);
      return reply(await ask(STEPS_SYSTEM, STEPS, `It is now ${now} (${tz}).\n\nThe task:\n${task}`));
    }
    if (mode === 'assist') {
      const planner = JSON.stringify(body.context || {}).slice(0, 120000);
      // Earlier turns of this conversation (text only), so follow-ups make sense.
      const history = (Array.isArray(body.history) ? body.history : []).slice(-10)
        .filter((h: { role?: string; text?: unknown }) => (h?.role === 'user' || h?.role === 'assistant') && typeof h.text === 'string' && h.text)
        .map((h: { role: 'user' | 'assistant'; text: string }) => ({ role: h.role, content: h.text.slice(0, 4000) }));
      while (history.length && history[0].role !== 'user') history.shift();
      return reply(await ask(ASSIST_SYSTEM, ASSIST, `It is now ${now} (${tz}).\n\nTheir planner:\n${planner}\n\nThey ask:\n${text}`, history));
    }
    const out = await ask(SYSTEM, ITEMS, `It is now ${now} (${tz}).\n\nThey typed:\n${text}`) as { items: unknown[] };
    return reply({ items: out.items });
  } catch (e) {
    if (e instanceof Say) return reply({ error: e.message }, e.status);
    console.error(e);
    if (e instanceof Anthropic.AuthenticationError) return reply({ error: 'The Anthropic key was not accepted. Run setup-ai.sh again with a new key.' }, 502);
    if (e instanceof Anthropic.RateLimitError) return reply({ error: 'Claude is busy. Try again in a minute.' }, 503);
    if (e instanceof Anthropic.APIError) return reply({ error: 'Claude is not answering right now.' }, 502);
    return reply({ error: 'Something went wrong.' }, 500);
  }
});
