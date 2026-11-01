import { sourceURLUpgrades } from './source-urls.ts';

export interface Club {
  visibility?: 'open'|'private'; current_book?: {title:string;authors:string[]}|null; id: string; name: string; city: string; state: string; genres: string[];
  vibe: string | null; cadence: string | null; format: string | null;
  source_name: string | null; source_url: string | null; last_seen: string;
  lat: number | null; lng: number | null; verified: boolean; city_path?: string;
}
export interface Book { id: string; t: string; a: string; p: number | null; ol: string | null; c: number | null; m: string[]; s?: [string, number] }
export interface Stat { book_id: string; clubs: number; mean_pour?: number; finish_rate?: number; city?: string; state?: string }
export interface Community { national: Stat[]; city: Stat[]; state: Stat[]; next: { from_book: string; to_book: string; clubs: number }[] }
export interface Taste { moods: string[]; length: string | null; loved: string | null }
export interface Reminder { id: number; meeting: string; minutes: number; at: string }
export const emptyCommunity = (): Community => ({ national: [], city: [], state: [], next: [] });
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export const cityKey = (c: Pick<Club, 'city' | 'state'>) => `${c.city}, ${c.state}`;
export const safeURL = (v: unknown): string | null => {
  try { const u = new URL(String(v)); return u.protocol === 'https:' ? u.href : null; } catch { return null; }
};
export const clubURL = (c: Club) => `https://meetbookish.com${c.city_path || `/book-clubs/?city=${encodeURIComponent(c.city)}&state=${c.state}`}#${encodeURIComponent(c.id)}`;
export function appleMapsURL(c: Pick<Club, 'city' | 'state' | 'lat' | 'lng'>) {
  const p = new URLSearchParams({ q: cityKey(c) });
  if (c.lat != null && c.lng != null) p.set('ll', `${c.lat},${c.lng}`);
  return `https://maps.apple.com/?${p}`;
}
export function miles(a: number, b: number, c: number, d: number) {
  const r = Math.PI / 180, h = Math.sin((c-a)*r/2)**2 + Math.cos(a*r)*Math.cos(c*r)*Math.sin((d-b)*r/2)**2;
  return 7917.6 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function reminderDate(meeting: string, minutes: number, now = new Date()) {
  const at = new Date(new Date(meeting).getTime() - minutes * 60_000);
  if (![0, 60, 1440].includes(minutes) || !Number.isFinite(at.getTime()) || at <= now) throw new Error('Choose a meeting and reminder time ahead of now.');
  return at;
}
const str = (v: unknown, max = 500) => typeof v === 'string' ? v.slice(0, max) : '';
const optional = (v: unknown) => str(v) || null;
const strings = (v: unknown) => Array.isArray(v) ? v.filter(x => typeof x === 'string').slice(0, 20) : [];
const coord = (v: unknown, max: number) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max ? v : null;
export function validateFeed(kind: 'clubs', value: unknown): Club[];
export function validateFeed(kind: 'books', value: unknown): Book[];
export function validateFeed(kind: 'community', value: unknown): Community;
export function validateFeed(kind: string, value: unknown): Club[] | Book[] | Community {
  if (kind === 'community') {
    if (!value || typeof value !== 'object') throw new Error('community schema');
    const v = value as Community, out = emptyCommunity();
    for (const key of ['national', 'city', 'state'] as const) {
      if (!Array.isArray(v[key])) throw new Error('community schema');
      out[key] = v[key].filter(r => typeof r.book_id === 'string' && Number.isFinite(r.clubs) && r.clubs >= 3);
    }
    if (!Array.isArray(v.next)) throw new Error('community schema');
    out.next = v.next.filter(r => typeof r.from_book === 'string' && typeof r.to_book === 'string' && Number.isFinite(r.clubs) && r.clubs >= 3);
    return out;
  }
  if (!Array.isArray(value) || (kind !== 'clubs' && !value.length) || value.length > 20_000) throw new Error(`${kind} schema`);
  const seen = new Set<string>();
  const records = value.filter(v => kind !== 'clubs' || v?.visibility !== 'hidden').map(v => {
    if (!v || typeof v !== 'object' || !str(v.id, 80) || seen.has(v.id)) throw new Error(`${kind} schema`);
    seen.add(v.id);
    if (kind === 'books') {
      if (!str(v.t) || !str(v.a) || !Array.isArray(v.m)) throw new Error('books schema');
      return { id: str(v.id, 80), t: str(v.t), a: str(v.a), p: typeof v.p === 'number' ? v.p : null,
        ol: /^OL\d+W$/.test(v.ol) ? v.ol : null, c: Number.isSafeInteger(v.c) && v.c > 0 ? v.c : null, m: strings(v.m),
        ...(Array.isArray(v.s) && typeof v.s[0] === 'string' && Number.isFinite(v.s[1]) ? { s: [v.s[0], v.s[1]] as [string, number] } : {}) };
    }
    if (!str(v.name) || !str(v.city) || !/^[A-Z]{2}$/.test(v.state)) throw new Error('clubs schema');
    // Only city-level public facts cross into the app; never retain arbitrary remote fields.
    return { id: str(v.id, 80), name: str(v.name, 160), city: str(v.city, 80), state: v.state,
      genres: strings(v.genres), vibe: optional(v.vibe), cadence: optional(v.cadence), format: optional(v.format),
      source_name: optional(v.source_name), source_url: safeURL(sourceURLUpgrades.get(v.source_url) || v.source_url), last_seen: str(v.last_seen, 10),
      lat: coord(v.lat, 90), lng: coord(v.lng, 180), verified: v.verified === true, visibility: v.visibility === 'private' ? 'private' : 'open', current_book: v.current_book && typeof v.current_book.title==='string' ? {title:str(v.current_book.title,200),authors:strings(v.current_book.authors)} : null,
      city_path: /^\/book-clubs\/[a-z0-9/-]+\/$/.test(v.city_path) ? v.city_path : undefined };
  }) as Club[] | Book[];
  // A public-calendar club needs a usable source action. Hosted clubs have the
  // in-app join form, so a missing external calendar does not exclude them.
  return kind === 'clubs' ? (records as Club[]).filter(c => c.verified || c.source_url !== null) : records;
}
