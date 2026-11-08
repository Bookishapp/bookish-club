// Regression boundaries: platform visibility, chooser outcomes, and deep-link recovery.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'vite';
import { JSDOM } from 'jsdom';
import { createFixtureAPI, ids } from './fixtures.mjs';
const result=await build({root:new URL('../',import.meta.url).pathname,configFile:false,logLevel:'silent',build:{write:false,minify:false,lib:{entry:new URL('../src/community.ts',import.meta.url).pathname,name:'UI',formats:['iife']}}});
const script=(Array.isArray(result)?result[0]:result).output.find(x=>x.type==='chunk').code;
async function launch(platform='web',role='member'){
 const dom=new JSDOM('<dialog id="detail"></dialog>',{url:'https://localhost/',runScripts:'outside-only'}),w=dom.window,api=createFixtureAPI({role}),shares=[],notices=[];
 let shareError=null,failReload=false;
 w.AbortSignal=globalThis.AbortSignal;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const respond=async(url,body,method)=>{if(failReload&&url.endsWith('bookish_my_account'))throw Error('Offline fixture');return api.respond(url,body,method);};
 w.fetch=async(url,o={})=>{const data=await respond(url,o.body?JSON.parse(o.body):{},o.method);return{ok:true,status:200,text:async()=>JSON.stringify(data)};};
 if(platform!=='web'){
  w.CapacitorCustomPlatform={name:platform};
  const store=new Map();
  const methods={Preferences:['get','set','remove'],Share:['share'],CapacitorHttp:['request'],BookishMessages:['updateWidgets','clearWidgets']};
  w.Capacitor={PluginHeaders:Object.entries(methods).map(([name,methods])=>({name,methods:methods.map(name=>({name,rtype:'promise'}))})),nativePromise:async(plugin,method,o={})=>{
   if(plugin==='Preferences'){if(method==='get')return{value:store.get(o.key)??null};if(method==='set')store.set(o.key,o.value);else store.delete(o.key);return{};}
   if(plugin==='CapacitorHttp')return{status:200,data:await respond(o.url,o.data||{},o.method)};
   if(plugin==='Share'){shares.push(o);if(shareError)throw shareError;}
   return{};
  }};
 }
 w.eval(script+';window.ui=UI.community;');const ui=w.ui;ui.init(()=>{},s=>notices.push(s));
 const el=s=>{const n=w.document.querySelector(s);assert.ok(n,s);return n;},click=async s=>ui.click(el(s)),put=(s,v)=>el(s).value=v,submit=async s=>ui.submit(el(s));
 await ui.join('our-club');put('[name=email]','reader@example.test');await submit('#account-email');put('[name=token]','0123');await submit('#account-code');put('[name=display_name]','Alex');el('[name=adult]').checked=true;el('[name=terms]').checked=true;await submit('#account-terms');
 const b=w.document.createElement('button');b.dataset.home=ids.club;await ui.click(b);
 return{dom,w,ui,el,click,put,submit,shares,notices,setShareError:e=>shareError=e,failReload:()=>failReload=true};
}
for(const platform of ['web','android','ios'])for(const role of ['member','host'])test(`Widgets visibility: ${platform} ${role}`,async t=>{
 const x=await launch(platform,role);t.after(()=>x.dom.window.close());
 await x.click('#open-menu');assert.equal(!!x.w.document.querySelector('#widgets'),platform==='ios','Only iOS has a Widgets menu entry');
 await x.click('#account-settings');assert.equal(!!x.w.document.querySelector('#widgets'),platform==='ios'&&role==='member','Only iOS members have the Widgets settings row');
 if(role==='host')assert.ok(x.w.document.querySelector('#club-privacy'),'Hosts retain Club privacy on every platform');
});
for(const kind of ['meeting','take','vote'])test(`Android ${kind} card share has relevant public metadata`,async t=>{
 const x=await launch('android','host');t.after(()=>x.dom.window.close());
 await x.click(`[data-room-tab=${kind==='meeting'?'meet':kind==='vote'?'votes':'tea'}]`);await x.click(`[data-card-kind=${kind}]`);await x.click('#send-message-card');
 const expected={meeting:['Bookish club night','Open Bookish to RSVP and see the bring list.','Share club night'],take:['The Tea on Bookish','A sealed book take is waiting in Bookish.','Share a sealed take'],vote:['Our next read on Bookish','Open Bookish to choose our next book.','Share a book vote']}[kind];
 assert.deepEqual([x.shares[0].title,x.shares[0].text,x.shares[0].dialogTitle],expected);
 assert.match(x.shares[0].url,new RegExp(`#message=${kind}/`));
 assert.ok(!JSON.stringify(x.shares).includes('neighborhood library'),'Private meeting locations stay in Bookish');
});
for(const error of [new Error('Share canceled'),new Error('Sharing failed')])test(`Android chooser outcome: ${error.message}`,async t=>{
 const x=await launch('android','host');t.after(()=>x.dom.window.close());
 await x.click('[data-room-tab=meet]');await x.click('[data-card-kind=meeting]');x.setShareError(error);await x.click('#send-message-card');
 if(error.message==='Share canceled'){assert.equal(x.w.document.querySelector('.feature-error'),null);assert.ok(!x.notices.includes('Card link ready for your group chat.'));}
 else assert.match(x.el('.feature-error').textContent,/Sharing failed/);
});
for(const url of ['bookish://message/meeting/40000000-0000-4000-8000-000000000001','bookish://widget/meeting'])test(`Deep-link reload failure is reported: ${url}`,async t=>{
 const x=await launch();t.after(()=>x.dom.window.close());x.failReload();
 await assert.doesNotReject(x.ui.openMessage(url));assert.ok(x.notices.some(s=>/could not open/i.test(s)),'A reader-facing retry message explains the failed link');
});
