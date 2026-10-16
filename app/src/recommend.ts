// Port of src/read-next.js: same weights, sequel rules, and three recommendation slots.
import type { Book, Community, Taste, Stat } from './domain.ts';
export interface Ranked { b: Book; score: number; tasteS: number; lovedS: number; sequel: boolean; n?: Stat; next?: number; slot?: string }
export const moods: Record<string, string> = { fight: 'Lively debate', slow_burn: 'Slow burn', mystery: 'A good mystery', cry: 'All the feelings', big_fantasy: 'Big fantasy', short: 'A weekend read' };
const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };
const lenFit = (p: number | null, l: string | null) => !l || l === 'any' || !p ? 1 : l === 'short' ? p < 300 ? 1 : p < 350 ? .5 : 0 : l === 'mid' ? p >= 300 && p <= 450 ? 1 : p >= 250 && p <= 500 ? .5 : 0 : p > 450 ? 1 : p > 400 ? .5 : 0;
export function rank(books: Book[], comm: Community, t: Taste): Ranked[] {
  const loved = books.find(b => b.id === t.loved), nat = new Map(comm.national.map(r => [r.book_id, r]));
  const next = new Map(comm.next.filter(r => r.from_book === loved?.id).map(r => [r.to_book, r.clubs]));
  const maxNext = Math.max(1, ...next.values()), maxClubs = Math.max(1, ...comm.national.map(r => r.clubs));
  return books.filter(b => b !== loved && !(loved?.s && b.s && b.s[0] === loved.s[0] && b.s[1] <= loved.s[1])).map(b => {
    const hits = t.moods.filter(m => b.m.includes(m)).length;
    const tasteS = ((t.moods.length ? hits / t.moods.length : .5) + lenFit(b.p, t.length)) / 2;
    const sequel = !!(loved?.s && b.s && b.s[0] === loved.s[0] && b.s[1] === loved.s[1] + 1);
    const lovedS = loved ? b.m.filter(m => loved.m.includes(m)).length / Math.max(1, loved.m.length) + (b.a === loved.a ? .15 : 0) : 0;
    const hist = sequel ? 1 : (next.get(b.id) || 0) / maxNext, n = nat.get(b.id);
    const commS = n ? .5 * n.clubs / maxClubs + .5 * (((n.mean_pour ?? 3) * n.clubs + 15) / (n.clubs + 5) / 5) : 0;
    return { b, tasteS, lovedS, sequel, n, next: next.get(b.id), score: (loved ? .35*lovedS + .15*tasteS : .5*tasteS) + .2*hist + .2*commS + .001*hash(b.id) };
  }).sort((a,b) => b.score-a.score);
}
export function picks(books: Book[], t: Taste, ranked: Ranked[]) {
  const loved = books.find(b => b.id === t.loved), out: Ranked[] = [], authors = new Set<string>();
  const ok = (r: Ranked) => !out.includes(r) && !authors.has(r.b.a) && !(r.sequel && out.some(o => o.sequel));
  const add = (r: Ranked | undefined, slot: string) => { if (r && ok(r)) { out.push({ ...r, slot }); authors.add(r.b.a); } };
  const fits = (r: Ranked) => lenFit(r.b.p, t.length) > 0;
  add(ranked.find(r => r.sequel || r.next) || (loved && [...ranked].filter(fits).sort((a,b) => b.lovedS-a.lovedS || b.score-a.score).find(ok)) || ranked.find(r => ok(r) && fits(r)), 'A familiar spark');
  add([...ranked].sort((a,b) => b.tasteS-a.tasteS || b.score-a.score).find(r => ok(r) && fits(r)), 'Your kind of book');
  add(ranked.find(r => ok(r) && fits(r) && r.b.m.includes('fight')) || ranked.find(r => ok(r) && fits(r)) || ranked.find(ok), 'A little adventure');
  return out;
}
export function why(r: Ranked, t: Taste) {
  if (r.sequel) return 'The next chapter in a world you loved.';
  if (r.next) return `${r.next} clubs read this after your pick.`;
  const m = t.moods.find(m => r.b.m.includes(m)) || r.b.m[0];
  return ({ fight: 'Plenty to talk about around the table.', slow_burn: 'A little yearning goes a long way.', mystery: 'One more clue, one more chapter.', cry: 'A story to feel together.', big_fantasy: 'A whole new world for your next gathering.', short: 'A lovely little weekend read.' } as Record<string,string>)[m] || 'Pull up a chair for this one.';
}
