import { responseHeaders } from './account-deletion.ts';

type Reminder = {
  id: string;
  lease: string;
  meeting_id: string;
  email: string;
  title: string;
  starts_at: string;
  location: string;
  calendar_generated_at: string;
};
type Calendar = { id: string; title: string; starts_at: string; location: string };
type Config = { from: string; resendKey: string };
type ReminderDependencies = {
  key: () => Promise<string | undefined>;
  config: () => Promise<Config | null>;
  claim: () => Promise<Reminder[]>;
  prepare: (id: string, lease: string) => Promise<Reminder | null>;
  complete: (id: string, lease: string) => Promise<void>;
  fetcher?: typeof fetch;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reply = (status: number, body: unknown) =>
  Response.json(body, { status, headers: { 'cache-control': 'private, no-store' } });
async function equalKey(a: string, b: string) {
  const hashes = await Promise.all([a, b].map((s) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))));
  const [left, right] = hashes.map((h) => new Uint8Array(h));
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}
export function remindersHandler(deps: ReminderDependencies) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return reply(405, { ok: false });
    try {
      const key = await deps.key();
      if (!key || key.length < 32) return reply(503, { ok: false });
      const supplied = req.headers.get('x-bookish-worker-key') || '';
      if (!supplied || supplied.length > 256 || !await equalKey(key, supplied)) return reply(401, { ok: false });
      const text = await req.text();
      if (text.length > 1024) return reply(413, { ok: false });
      let body;
      try { body = JSON.parse(text); } catch { return reply(400, { ok: false }); }
      if (!body || Array.isArray(body) || body.action !== 'run' || Object.keys(body).length !== 1) return reply(400, { ok: false });
      const config = await deps.config();
      if (!config?.from || !config.resendKey) return reply(503, { ok: false });
      const batch = await deps.claim();
      if (!Array.isArray(batch) || batch.length > 50) return reply(503, { ok: false });
      let sent = 0, skipped = 0, failed = 0;
      for (const claim of batch) {
        try {
          if (!uuid.test(claim.id) || !uuid.test(claim.lease)) throw Error('Invalid claim');
          // The database rechecks membership, RSVP, opt-out, date, cancellation,
          // snapshot equality, and lease ownership immediately before delivery.
          const row = await deps.prepare(claim.id, claim.lease);
          if (!row) { skipped++; continue; }
          if (row.id !== claim.id || row.lease !== claim.lease || !uuid.test(row.meeting_id)) throw Error('Invalid delivery');
          // Persisted first-lease time keeps the attachment byte-identical on retries.
          const calendar = meetingIcs({ id: row.meeting_id, title: row.title, starts_at: row.starts_at, location: row.location }, new Date(row.calendar_generated_at));
          const content = btoa(Array.from(new TextEncoder().encode(calendar), (byte) => String.fromCharCode(byte)).join(''));
          const response = await (deps.fetcher || fetch)('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              authorization: `Bearer ${config.resendKey}`,
              'content-type': 'application/json',
              'Idempotency-Key': `bookish-meeting-reminder/${row.id}`,
            },
            body: JSON.stringify({
              from: config.from,
              to: [row.email],
              subject: 'Your Bookish meeting is coming up',
              text: `${row.title}\n\nCalendar invite attached. Open it for your local meeting time.\n\nTurn off meeting reminders in your club settings.`,
              attachments: [{ filename: `bookish-${row.meeting_id}.ics`, content }],
            }),
            signal: AbortSignal.timeout(10000),
          });
          if (!response.ok) throw Error('Delivery unavailable');
          await deps.complete(row.id, row.lease);
          sent++;
        } catch { failed++; }
      }
      return reply(failed ? 503 : 200, { ok: failed === 0, sent, skipped, failed });
    } catch { return reply(503, { ok: false }); }
  };
}
function escapeIcs(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}
function foldIcs(line: string) {
  const lines: string[] = [];
  let current = '', bytes = 0;
  for (const char of line) {
    const size = new TextEncoder().encode(char).length;
    if (bytes + size > 75) { lines.push(current); current = ' '; bytes = 1; }
    current += char; bytes += size;
  }
  lines.push(current);
  return lines.join('\r\n');
}
export function meetingIcs(meeting: Calendar, generatedAt = new Date()) {
  const stamp = generatedAt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const start = new Date(meeting.starts_at).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Bookish//Club Meetings//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', `UID:${meeting.id}@meetbookish.com`, `DTSTAMP:${stamp}`, `DTSTART:${start}`, 'DURATION:PT2H',
    `SUMMARY:${escapeIcs(meeting.title)}`, `LOCATION:${escapeIcs(meeting.location)}`,
    'END:VEVENT', 'END:VCALENDAR', '',
  ].map(foldIcs).join('\r\n');
}
type CalendarDependencies = {
  getUser: (token: string) => Promise<{ app_metadata?: { app?: string }; email_confirmed_at?: string | null } | null>;
  calendar: (token: string, meeting: string) => Promise<Calendar>;
};
export function calendarHandler(deps: CalendarDependencies) {
  return async (req: Request): Promise<Response> => {
    const headers = { ...responseHeaders(req), 'access-control-allow-methods': 'GET, OPTIONS', 'cache-control': 'private, no-store' };
    const reply = (status: number, body: unknown) => Response.json(body, { status, headers });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'GET') return reply(405, { ok: false });
    const meeting = new URL(req.url).searchParams.get('meeting') || '';
    if (!uuid.test(meeting)) return reply(400, { ok: false });
    const token = /^Bearer ([^\s]+)$/i.exec(req.headers.get('authorization') || '')?.[1];
    if (!token || token.length > 8192) return reply(401, { ok: false });
    try {
      const user = await deps.getUser(token);
      if (user?.app_metadata?.app !== 'bookish' || !user.email_confirmed_at) return reply(401, { ok: false });
      // Execute as this reader, never as the service role.
      const data = await deps.calendar(token, meeting);
      return new Response(meetingIcs(data), { headers: {
        ...headers,
        'access-control-expose-headers': 'content-disposition',
        'content-type': 'text/calendar; charset=utf-8',
        'content-disposition': `attachment; filename="bookish-${meeting}.ics"`,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      } });
    } catch { return reply(404, { ok: false }); }
  };
}
