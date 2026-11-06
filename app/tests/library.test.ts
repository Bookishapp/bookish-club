import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadLibrary,saveBookRating,loadRecommendations,ratingLabel} from '../src/library.ts';
const club='91000000-0000-0000-0000-000000000001';
const book={id:'persuasion',title:'Persuasion',authors:['Jane Austen'],cover_id:null,cover_url:null,moods:[]};
const row={book,status:'finished',started_at:'2026-09-01',finished_at:'2026-10-01',mean_hearts:4.2,rated_count:5,member_count:6,my_rating:{hearts:4,take:'A lovely book',anonymous:true},favorite_take:{id:club,body:'A thought',attribution:'Anonymous'}};
const payload={club:{id:club,name:'Readers',created_at:'2026-03-01T00:00:00Z'},books:[row]};
test('library projects safe fields and restores own rating and shared shelf history',async()=>{
 const result=await loadLibrary(async()=>({...payload,author_id:'private',books:[{...row,user_id:'private'}]}),club);
 assert.equal(result.books[0].myRating?.hearts,4);assert.equal(result.books[0].meanHearts,4.2);assert.equal(result.books[0].favoriteTake?.attribution,'Anonymous');assert.ok(!JSON.stringify(result).includes('private'));assert.equal(result.club.name,'Readers');
});
test('saving requires explicit attribution and uses only the rating RPC arguments',async()=>{
 let args:unknown;const result=await saveBookRating(async(name,params)=>{assert.equal(name,'bookish_rate_book');args=params;return row;},club,'persuasion',{hearts:4,take:'  A lovely book  ',anonymous:false});
 assert.deepEqual(args,{p_club:club,p_book:'persuasion',p_hearts:4,p_take:'A lovely book',p_anonymous:false});assert.equal(result.book.id,'persuasion');
 for(const input of [{hearts:0,take:'',anonymous:true},{hearts:4,take:'x'.repeat(281),anonymous:true},{hearts:4,take:'',anonymous:null}])await assert.rejects(saveBookRating(async()=>row,club,'persuasion',input as never),/rating|heart|attribution|280/i);
});
test('recommendation evidence stays numeric and empty data stays empty',async()=>{
 assert.deepEqual(await loadRecommendations(async()=>[],club),[]);
 const result=await loadRecommendations(async()=>[{book,because_book:{id:'emma',title:'Emma'},mean_hearts:4.6,clubs:3,club_ids:['secret']}],club);
 assert.equal(result[0].clubs,3);assert.equal(result[0].becauseBook.title,'Emma');assert.ok(!JSON.stringify(result).includes('secret'));
 await assert.rejects(loadRecommendations(async()=>[{book,because_book:{id:'emma',title:'Emma'},mean_hearts:4.6,clubs:2}],club),/recommendations|unavailable/i);
});
test('malformed or failed data produces generic errors without leaking backend details',async()=>{
 await assert.rejects(loadLibrary(async()=>{throw Error('private email');},club),e=>e instanceof Error&&!e.message.includes('private'));
 for(const field of [{mean_hearts:6},{rated_count:-1},{status:'ranking'},{my_rating:{hearts:2.5,take:'',anonymous:true}}])await assert.rejects(loadLibrary(async()=>({...payload,books:[{...row,...field}]}),club),/unavailable/i);
 assert.equal(ratingLabel(4),'4 hearts, really liked it');assert.equal(ratingLabel(0),'Choose your hearts');
});
