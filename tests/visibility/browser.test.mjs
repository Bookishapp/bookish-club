import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from '../../app/node_modules/jsdom/lib/api.js';
const root=new URL('../../',import.meta.url);
const script=p=>fs.readFileSync(new URL(`${p==='discovery.js'?'dist':'src'}/${p}`,root),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,20));
test('discovery renders fresh server results and clears cards when refresh fails',async()=>{
 const dom=new JSDOM('<html data-directory-api="https://local.test/bookish-directory"><body><section id="live-directory"><input id="live-query"><p id="live-status"></p><ul id="live-clubs"></ul><button id="live-more"></button></section></body></html>',{url:'https://meetbookish.com',runScripts:'outside-only'}),w=dom.window;
 w.AbortSignal=globalThis.AbortSignal;
 let hidden=false;
 w.fetch=async()=>({ok:!hidden,json:async()=>({ok:true,clubs:[{id:'public-ref',name:'Canary club',city:'Austin',state:'TX',visibility:'private',verified:true,current_book:{title:'Piranesi'},genres:[]},{id:'calendar-ref',name:'Calendar club',city:'Austin',state:'TX',visibility:'open',verified:false,source_url:'https://example.test/calendar',genres:[]}]})});
 w.eval(script('discovery.js'));await tick();
 assert.match(w.document.querySelector('#live-clubs').textContent,/Canary club/);assert.match(w.document.querySelector('#live-clubs').textContent,/Piranesi/);
 assert.match(w.document.querySelector('#live-clubs a').textContent,/Request to join/);
 assert.ok(w.document.querySelector('a[href*="claim/?club_id=calendar-ref"]'));
 hidden=true;w.dispatchEvent(new w.Event('focus'));assert.equal(w.document.querySelector('#live-clubs').textContent,'');await tick();
 assert.ok(!w.document.body.textContent.includes('Canary club'));dom.window.close();
});
test('creation has a required explicit visibility with Private selected',()=>{
 const dom=new JSDOM(fs.readFileSync(new URL('dist/start/index.html',root),'utf8'));
 const values=[...dom.window.document.querySelectorAll('[name=visibility]')];
 assert.deepEqual(values.map(x=>x.value),['open','private','hidden']);assert.ok(values.every(x=>x.required));assert.equal(values.find(x=>x.checked).value,'private');dom.window.close();
});
test('host capability leaves URL history, stays off disk, and settings save and rotate work',async()=>{
 const token='11111111-1111-4111-8111-111111111111';
 const dom=new JSDOM('<html data-directory-api="https://local.test/bookish-directory"><body><section id="host-settings"><form id="host-link"><input name="link"></form><p id="host-status"></p><div id="host-controls"></div></section></body></html>',{url:`https://meetbookish.com/club-settings/#club=secret&host=${token}`,runScripts:'outside-only'}),w=dom.window;
 let visibility='private',invite=null;
 w.fetch=async(url,options)=>{assert.equal(options.headers.authorization,`Bearer ${token}`);const b=JSON.parse(options.body);assert.equal(b.club_id,'secret');if(b.action==='save')visibility=b.visibility;if(b.action==='rotate')invite='ABCDEFGH2345';return{ok:true,json:async()=>({ok:true,club:{id:'secret',name:'Host club',city:'Austin',state:'TX',visibility},invite,requests:[]})};};
 w.eval(script('club-settings.js'));await tick();assert.equal(w.location.hash,'');assert.equal(w.localStorage.length,0);
 w.document.querySelector('[value=hidden]').checked=true;w.document.querySelector('#visibility-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();assert.equal(visibility,'hidden');
 w.document.querySelector('[data-rotate]').click();await tick();assert.match(w.document.querySelector('#host-controls').textContent,/ABCDEFGH2345/);assert.ok(!w.document.documentElement.innerHTML.includes(token));dom.window.close();
});
test('live public calendar discovery repairs verified legacy sources and excludes unusable sources',async()=>{
 const dom=new JSDOM('<html data-directory-api="https://local.test/bookish-directory"><body><section id="live-directory"><input id="live-query"><p id="live-status"></p><ul id="live-clubs"></ul><button id="live-more"></button></section></body></html>',{url:'https://meetbookish.com',runScripts:'outside-only'}),w=dom.window;
 w.AbortSignal=globalThis.AbortSignal;
 const legacy='http://mysapl.org/EventsNews/EventsCalendar.aspx?trumbaEmbed=view%3Devent%26eventid%3D183243992';
 const upgraded='https://www.mysapl.org/Events-News/Events-Calendar?trumbaEmbed=view%3Devent%26eventid%3D183243992';
 const club={city:'Austin',state:'TX',visibility:'open',verified:false,genres:[]};
 const rows=[
  {...club,id:'safe',name:'Safe calendar',source_url:'https://example.test/calendar'},
  {...club,id:'legacy',name:'Legacy calendar',source_url:legacy},
  {...club,id:'missing',name:'Missing source',source_url:null},
  {...club,id:'unknown-http',name:'Unknown HTTP',source_url:'http://unknown.example/event'},
  {...club,id:'unsafe',name:'Unsafe source',source_url:'javascript:alert(1)'},
  {...club,id:'hosted',name:'Hosted club',verified:true,source_url:null},
 ];
 w.fetch=async()=>({ok:true,json:async()=>({ok:true,clubs:rows})});
 try{
  w.eval(script('discovery.js'));await tick();
  assert.equal(w.document.querySelector('#legacy a.join')?.href,upgraded);
  assert.deepEqual([...w.document.querySelectorAll('#live-clubs > li')].map(c=>c.id),['safe','legacy','hosted']);
  assert.match(w.document.querySelector('#hosted a.join').href,/\/join\/\?club_id=hosted/);
 }finally{dom.window.close();}
});
