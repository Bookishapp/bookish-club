// Focused community render and behavior checks. Bundles into memory only.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { JSDOM } from 'jsdom';
import { createFixtureAPI } from './fixtures.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const result=await build({root,configFile:false,logLevel:'silent',build:{write:false,minify:false,lib:{entry:new URL('../src/community.ts',import.meta.url).pathname,name:'BookishCommunity',formats:['iife']}}});
const script=(Array.isArray(result)?result[0]:result).output.find(file=>file.type==='chunk').code;
async function launch(role='host'){
 const api=createFixtureAPI({role});
 const dom=new JSDOM('<!doctype html><dialog id="detail"></dialog>',{url:'https://localhost/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;w.AbortSignal=globalThis.AbortSignal;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.fetch=async(url,options={})=>{const body=options.body?JSON.parse(options.body):{};const data=await api.respond(url,body,options.method);return{ok:!data?.$status,status:data?.$status||200,json:async()=>data,text:async()=>JSON.stringify(data)};};
 w.eval(script+'\nwindow.testCommunity=BookishCommunity.community;');
 const ui=w.testCommunity;ui.init(()=>{},()=>{});
 const select=s=>{const node=w.document.querySelector(s);assert.ok(node,s);return node;};
 const click=async s=>ui.click(select(s));
 const input=(s,value)=>{const node=select(s);node.value=value;node.dispatchEvent(new w.Event('input',{bubbles:true}));return node;};
 const submit=async s=>ui.submit(select(s));
 await ui.join('after-hours-chicago');
 input('[name=email]','reader@example.test');await submit('#account-email');
 return{dom,w,api,ui,select,click,input,submit};
}
for(const code of ['1234','123456','1234567890']){
 const t=await launch();
 assert.equal(t.select('#email-code').autocomplete,'one-time-code');
 assert.equal(t.select('#email-code').inputMode,'numeric');
 for(const invalid of ['123','12345','12345678901']){const field=t.input('#email-code',invalid);assert.equal(field.checkValidity(),invalid.length===11,'Only input truncation can turn an invalid length into a valid code');}
 t.input('#email-code',code);
 assert.equal(t.select('#account-code').checkValidity(),true);
 assert.equal(t.select('.code-field').dataset.codeLength,String(code.length));
 assert.equal(t.select('.code-boxes').textContent,code);
 await t.submit('#account-code');
 assert.ok(t.api.calls.some(call=>call.body.action==='verify'&&call.body.token===code),'The full code reaches the existing transport');
 assert.ok(t.select('#account-terms'));
 for(const name of ['adult','terms'])t.select(`[name=${name}]`).checked=true;
 t.input('[name=display_name]','Alex');await t.submit('#account-terms');
 assert.ok(t.select('#account-join'));
 t.dom.window.close();
}
for(const role of ['host','member']){
 const t=await launch(role);t.input('#email-code','123456');await t.submit('#account-code');
 t.input('[name=display_name]','Alex');for(const name of ['adult','terms'])t.select(`[name=${name}]`).checked=true;await t.submit('#account-terms');
 const button=t.w.document.createElement('button');button.dataset.home='10000000-0000-4000-8000-000000000001';await t.ui.click(button);
 assert.match(t.select('.meeting-card').textContent,/neighborhood library/);
 await t.click('[data-room-tab=members]');
 assert.equal(Boolean(t.w.document.querySelector('[data-decide]')),role==='host','Only hosts see approval controls');
 assert.equal(Boolean(t.w.document.querySelector('[data-room-tab=manage]')),role==='host','Only hosts see management');
 await t.click('[data-room-tab=votes]');
 assert.match(t.select('.vote-privacy').textContent,/Votes are anonymous/);
 assert.ok(!t.api.calls.some(call=>call.url.includes('bookish_vote_ballots')));
 await t.click('[data-ballot]');assert.ok(t.select('[data-ballot][aria-pressed=true]'));
 await t.click('#community-close');assert.equal(t.select('#detail').open,false);assert.equal(t.select('#detail').hasAttribute('data-community'),false);
 t.dom.window.close();
}
console.log('Community art checks passed: four-, six-, and ten-digit autofill input, backend payloads, legal acceptance, private meeting detail, host/member access, and anonymous votes.');
