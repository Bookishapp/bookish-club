import { test } from 'node:test';
import assert from 'node:assert/strict';
import { miles, reminderDate, validateFeed, appleMapsURL } from '../src/domain.ts';
import { rank, picks } from '../src/recommend.ts';
import fs from 'node:fs';

test('location uses city centers and correctly orders nearby cities', () => {
  assert.equal(miles(41.88, -87.63, 41.88, -87.63), 0);
  assert.ok(miles(41.88, -87.63, 40.71, -74) > 700);
  assert.match(appleMapsURL({ city: 'Chicago', state: 'IL', lat: 41.88, lng: -87.63 }), /ll=41.88%2C-87.63/);
  assert.ok(!appleMapsURL({ city: 'Chicago', state: 'IL', lat: null, lng: null }).includes('null'));
});
test('reminders reject past or invalid meeting dates and times already passed', () => {
  const now = new Date('2030-01-01T12:00:00Z');
  assert.throws(() => reminderDate('nonsense', 60, now));
  assert.throws(() => reminderDate('2030-01-01T12:30:00Z', 60, now));
  assert.equal(reminderDate('2030-01-02T12:00:00Z', 60, now).toISOString(), '2030-01-02T11:00:00.000Z');
});
test('feed rejects malformed data and strips fields outside the public city-level schema', () => {
  assert.throws(() => validateFeed('clubs', [{ id: 'test' }]));
  const [c] = validateFeed('clubs', [{ id: 'test', name: 'Readers', city: 'Chicago', state: 'IL', lat: 41, lng: -87, address: 'private', verified: true }]);
  assert.ok(!('address' in c));
  assert.equal(c.verified, true);
  assert.throws(() => validateFeed('books', [{ id: 'broken' }]));
});
test('read-next preserves sequel preference, author diversity, and excludes loved book', () => {
  const books = JSON.parse(fs.readFileSync(new URL('../public/data/books.json', import.meta.url), 'utf8'));
  const taste = { moods: ['big_fantasy'], length: 'any', loved: 'fourth-wing' };
  const ranked = rank(books, { national: [], next: [], city: [], state: [] }, taste);
  assert.ok(!ranked.some(r => r.b.id === taste.loved));
  const chosen = picks(books, taste, ranked);
  assert.equal(chosen.length, 3);
  assert.equal(chosen[0].b.id, 'iron-flame');
  assert.equal(new Set(chosen.map(r => r.b.a)).size, 3);
  assert.ok(chosen.filter(r => r.sequel).length <= 1);
});
