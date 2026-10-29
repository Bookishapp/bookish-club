import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarEvent } from '../src/calendar.ts';

test('calendar export preserves the meeting instant, reminder, and text as a single safe event', () => {
  const text = calendarEvent('Club, with; books\nBEGIN:VEVENT', '2030-05-07T19:30:00.000Z', 60);
  assert.ok(text.includes('DTSTART:20300507T193000Z\r\n'));
  assert.ok(text.includes('TRIGGER:-PT60M\r\n'));
  assert.ok(text.includes('SUMMARY:Club\\, with\\; books\\nBEGIN:VEVENT\r\n'));
  assert.equal(text.match(/^BEGIN:VEVENT$/gm)?.length, 1);
  assert.ok(text.endsWith('END:VCALENDAR\r\n'));
});

test('calendar export rejects invalid meeting dates and unsupported reminder offsets', () => {
  assert.throws(() => calendarEvent('Club', 'not-a-date', 60));
  assert.throws(() => calendarEvent('Club', '2030-05-07T19:30:00.000Z', -1));
});
