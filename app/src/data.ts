import { validateFeed, emptyCommunity } from './domain.ts';
import type { Club, Book, Community } from './domain.ts';
import { writeStore, remoteJSON } from './native.ts';
export const data: {clubs:Club[];books:Book[];community:Community;updated:string|null} = {clubs:[],books:[],community:emptyCommunity(),updated:null};
export async function loadData() {
 data.books=validateFeed('books',await (await fetch('/data/books.json')).json());
 data.clubs=[];data.community=emptyCommunity();
 // Purge previous releases' persisted club snapshots before rendering anything.
 await writeStore('feed',{books:data.books});
 await refreshData();
}
let generation=0;
export async function refreshData() {
 const current=++generation;data.clubs=[];data.community=emptyCommunity();
 let success=0;
 await Promise.allSettled((['clubs','community'] as const).map(async key=>{
  const url=`https://wqnrortftkffmbeugjky.supabase.co/functions/v1/${key==='clubs'?'bookish-directory':'bookish-community'}?fresh=${Date.now()}`;
  const r=await remoteJSON(url);if(current!==generation||!r.ok)throw new Error('refresh');
  if(key==='clubs')data.clubs=validateFeed('clubs',r.data.clubs);
  else data.community=validateFeed('community',r.data);
  success++;
 }));
 if(current!==generation)return false;
 if(success)data.updated=new Date().toISOString();
 return success===2;
}
export function clearDiscovery(){generation++;data.clubs=[];data.community=emptyCommunity();}
