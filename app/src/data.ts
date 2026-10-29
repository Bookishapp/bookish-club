import { appAsset } from './paths.ts';
import { validateFeed, emptyCommunity } from './domain.ts';
import type { Club, Book, Community } from './domain.ts';
import { readStore, writeStore, remoteJSON } from './native.ts';
export const data: {clubs:Club[];books:Book[];community:Community;updated:string|null} = {clubs:[],books:[],community:emptyCommunity(),updated:null};
export async function loadData() {
  const [clubs,books,community] = await Promise.all(['clubs','books','community'].map(async key => (await fetch(appAsset(`data/${key}.json`))).json()));
  data.clubs = validateFeed('clubs',clubs); data.books = validateFeed('books',books); data.community = validateFeed('community',community);
  const cached = await readStore<{clubs?:unknown;books?:unknown;community?:unknown;updated?:string}>('feed',{});
  try { if (cached.clubs) data.clubs = validateFeed('clubs',cached.clubs); } catch { /* retain bundled copy */ }
  try { if (cached.books) data.books = validateFeed('books',cached.books); } catch { /* retain bundled copy */ }
  try { if (cached.community) data.community = validateFeed('community',cached.community); } catch { /* retain bundled copy */ }
  data.updated = cached.updated || null;
}
let refreshing = false;
export async function refreshData() {
  if (refreshing) return false;
  refreshing = true;
  let success = 0;
  try {
    await Promise.allSettled((['clubs','books','community'] as const).map(async key => {
      const r = await remoteJSON(`https://meetbookish.com/data/${key}.json`);
      if (!r.ok) throw new Error('refresh');
      if (key==='clubs') data.clubs=validateFeed(key,r.data);
      else if (key==='books') data.books=validateFeed(key,r.data);
      else data.community=validateFeed(key,r.data);
      success++;
    }));
    if (success) { data.updated=new Date().toISOString(); await writeStore('feed',data); }
    return success === 3;
  } finally { refreshing=false; }
}
