// Calendar files let browser readers keep a reminder in their own calendar.
// They do not imply that Bookish can send browser or iOS notifications.
export function calendarEvent(title: string, meeting: string, minutes: number): string {
  const date = new Date(meeting);
  if (!Number.isFinite(date.getTime()) || ![0, 60, 1440].includes(minutes)) throw new Error('Choose a valid meeting and reminder time.');
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const text = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Bookish//Meeting//EN', 'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}@meetbookish.com`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(date)}`,
    `SUMMARY:${text(title)}`, 'DESCRIPTION:Bring your book and your best theory. Confirm the meeting place with your host.',
    'BEGIN:VALARM', `TRIGGER:-PT${minutes}M`, 'ACTION:DISPLAY', 'DESCRIPTION:Book club meeting', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'];
  // RFC 5545 content lines are folded at 75 UTF-8 octets.
  return lines.map(line => {
    let out = '', size = 0;
    for (const char of line) {
      const bytes = new TextEncoder().encode(char).length;
      if (size + bytes > 75) { out += '\r\n '; size = 1; }
      out += char; size += bytes;
    }
    return out;
  }).join('\r\n') + '\r\n';
}
