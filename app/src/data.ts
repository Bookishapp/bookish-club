import { appAsset } from './paths.ts';
import { validateFeed, emptyCommunity } from './domain.ts';
import type { Club, Book, Community } from './domain.ts';
import { writeStore, remoteJSON } from './native.ts';
export const data: {clubs:Club[];books:Book[];community:Community;updated:string|null;discovery:'loading'|'ready'|'unavailable'} = {clubs:[],books:[],community:emptyCommunity(),updated:null,discovery:'loading'};
export async function loadData() {
 data.books=validateFeed('books',await (await fetch(appAsset('data/books.json'))).json());
 data.clubs=[];data.community=emptyCommunity();
 // Purge previous releases' persisted club snapshots before rendering anything.
 await writeStore('feed',{books:data.books});
 await refreshData();
}
let generation=0;
export async function refreshData() {
 const current=++generation;data.clubs=[];data.community=emptyCommunity();data.discovery='loading';
 let success=0,loadedClubs=false;
 await Promise.allSettled((['clubs','community'] as const).map(async key=>{
  const url=`https://tkrsrnlasinmlftkcufi.supabase.co/functions/v1/${key==='clubs'?'bookish-directory':'bookish-community'}?fresh=${Date.now()}`;
  const r=await remoteJSON(url);if(current!==generation||!r.ok)throw new Error('refresh');
  if(key==='clubs'){data.clubs=validateFeed('clubs',r.data.clubs);loadedClubs=true;}
  else data.community=validateFeed('community',r.data);
  success++;
 }));
 if(current!==generation)return false;
 if(success)data.updated=new Date().toISOString();
 data.discovery=loadedClubs?'ready':'unavailable';
 return loadedClubs;
}
export function clearDiscovery(){generation++;data.clubs=[];data.community=emptyCommunity();data.discovery='loading';}
