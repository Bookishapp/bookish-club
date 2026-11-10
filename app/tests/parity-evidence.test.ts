import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error The capture orchestration is a standalone Node module.
import {assertWebCoverage,comparisonHTML,requiredWebScreens,requiredNativeScreens,primaryCaptureByScreen,reviewScores} from '../scripts/parity-evidence.mjs';
// @ts-expect-error The local API fixture is a standalone Node module.
import {createFixtureAPI,ids} from './fixtures.mjs';

test('winner evidence uses the persisted SQL winner, including zero-ballot host choices',async()=>{
 const api=createFixtureAPI({counts:[0,0]});
 const rpc=(name:string,args={})=>api.respond(`https://local.test/rest/v1/rpc/${name}`,args,'POST');
 assert.equal((await rpc('bookish_close_vote')).$status,400,'A tie requires an explicit host choice');
 assert.equal(await rpc('bookish_close_vote',{p_winner:ids.two}),ids.two);
 const home=await rpc('bookish_club_home');
 assert.equal(home.votes[0].winner_option,ids.two);
 assert.equal(home.current_book.id,'yellowface');
 assert.equal(await rpc('bookish_close_vote',{p_winner:ids.one}),ids.two,'A closed vote preserves its recorded winner');
});

test('every review-table screen below eight is counted, including members',()=>{
 assert.equal(requiredWebScreens.length,29);
 assert.equal(requiredWebScreens.length+requiredNativeScreens.length,34);
 assert.equal(Object.keys(reviewScores).length,34);
 assert.equal(reviewScores['26'],7);
 assert.equal(primaryCaptureByScreen['26'],'26-members');
 assert.equal(new Set([...requiredWebScreens,...requiredNativeScreens]).size,34);
});

test('required parity evidence cannot substitute an equivalent or omit a screen',()=>{
 const captures=requiredWebScreens.map((id:string)=>({id:primaryCaptureByScreen[id],approved:id,comparison:`${id}.png`,checks:{width:390,height:844}}));
 assert.doesNotThrow(()=>assertWebCoverage(captures));
 assert.throws(()=>assertWebCoverage(captures.slice(1)),/Missing actual built screen 01/);
 assert.throws(()=>assertWebCoverage([{...captures[0],id:'01-welcome-equivalent'},...captures.slice(1)]),/Missing actual built screen/);
 assert.throws(()=>assertWebCoverage(captures.map((c:{id:string})=>c.id==='27-share-invite'?{...c,id:'27-redeem-invite'}:c)),/Missing actual built screen 27/);
 assert.throws(()=>assertWebCoverage([{...captures[0],comparison:null},...captures.slice(1)]),/side-by-side/);
});
test('side-by-side evidence places approved left, built right, and preserves phone dimensions',()=>{
 const html=comparisonHTML('data:image/png;base64,APPROVED','data:image/png;base64,BUILT','01 Welcome');
 assert.ok(html.indexOf('APPROVED')<html.indexOf('BUILT'));
 assert.match(html,/grid-template-columns:390px 390px/);
 assert.match(html,/height:844px/);
});
