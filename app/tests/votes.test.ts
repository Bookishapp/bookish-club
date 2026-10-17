import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { loadAnonymousVote, renderAnonymousVote } from '../src/votes.ts';

const voteId='10000000-0000-4000-8000-000000000000';
const first='20000000-0000-4000-8000-000000000001';
const second='20000000-0000-4000-8000-000000000002';
const rows=()=>[{option_id:first,book_id:'book-a',ballots:3},{option_id:second,book_id:'book-b',ballots:0}];
const rpc=(tally:unknown=rows(),own:unknown=first)=>async(name:string)=>name==='bookish_vote_tally'?tally:own;

test('requests only aggregate and caller-scoped RPCs, and projects no identity fields',async()=>{
  const calls:unknown[]=[];
  const tally=rows().map(row=>({...row,user_id:'SECRET',display_name:'SECRET',voters:['SECRET'],avatar_url:'SECRET'}));
  const vote=await loadAnonymousVote(async(name,args)=>{calls.push([name,args]);return rpc(tally)(name);},voteId);
  assert.deepEqual(calls,[['bookish_vote_tally',{p_vote:voteId}],['bookish_my_vote',{p_vote:voteId}]]);
  assert.deepEqual(vote,{options:[{optionId:first,bookId:'book-a',count:3},{optionId:second,bookId:'book-b',count:0}],total:3,myOptionId:first});
  assert.ok(!JSON.stringify(vote).includes('SECRET'));
  const dom=new JSDOM(renderAnonymousVote(vote,{'book-a':'<script>bad()</script>','book-b':'Another book'}));
  const text=dom.window.document.body.textContent!;
  assert.match(text,/Anonymous votes/);assert.match(text,/3 votes/);assert.match(text,/0 votes/);
  assert.equal((text.match(/Your vote/g)||[]).length,1);
  assert.match(text,/including the vote creator and club admins/);
  assert.equal(dom.window.document.querySelectorAll('script,img').length,0);
  assert.ok(!dom.window.document.body.innerHTML.includes('SECRET'));
  dom.window.close();
});

test('zero totals and no own vote never invent participation',async()=>{
  const vote=await loadAnonymousVote(rpc(rows().map(r=>({...r,ballots:'0'})),null),voteId);
  assert.equal(vote.total,0);assert.equal(vote.myOptionId,null);
  assert.ok(!renderAnonymousVote(vote,{}).includes('Your vote'));
  assert.match(renderAnonymousVote(vote,{}),/0 votes/);
});

test('rejects raw ballots, malformed totals, duplicate options, and foreign own choices',async()=>{
  const malformed:unknown[]=[null,{},[],[{user_id:'SECRET',option_id:first}],
    [{...rows()[0],ballots:-1},rows()[1]], [{...rows()[0],ballots:1.5},rows()[1]],
    [{...rows()[0],ballots:'1e2'},rows()[1]], [{...rows()[0],ballots:Number.MAX_SAFE_INTEGER+1},rows()[1]],
    [rows()[0],rows()[0]], [{...rows()[0],option_id:'invalid'},rows()[1]],
    [{...rows()[0],book_id:''},rows()[1]]];
  for(const tally of malformed)await assert.rejects(loadAnonymousVote(rpc(tally),voteId),/^Error: This vote is unavailable\. Please try again\.$/);
  for(const own of ['30000000-0000-4000-8000-000000000000',{option_id:first,user_id:'SECRET'},[first]])
    await assert.rejects(loadAnonymousVote(rpc(rows(),own),voteId),/This vote is unavailable/);
  await assert.rejects(loadAnonymousVote(rpc(rows(),second),voteId),/This vote is unavailable/,'Own option must have at least one ballot');
});

test('rejects bad vote IDs before transport and never reflects sensitive backend errors',async()=>{
  let calls=0;
  await assert.rejects(loadAnonymousVote(async()=>{calls++;return[];},'bad'),/This vote is unavailable/);
  assert.equal(calls,0);
  await assert.rejects(loadAnonymousVote(async()=>{throw new Error('SECRET voter identity');},voteId),/^Error: This vote is unavailable\. Please try again\.$/);
});
