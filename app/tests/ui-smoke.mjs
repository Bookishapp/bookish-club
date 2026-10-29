// Exercises the shipped bundle without a server or external writes. Native calls
// require the separate iPhone checklist in RESULT.md.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
process.env.TZ='UTC';
const root = new URL('../', import.meta.url);
const html = fs.readFileSync(new URL('dist/index.html',root),'utf8');
const file = html.match(/src="([^"]+\.js)"/)[1];
const script = fs.readFileSync(new URL(`dist/${file.replace(/^\//,'')}`,root),'utf8');
const feeds = Object.fromEntries(['clubs','books','community'].map(k=>[k,JSON.parse(fs.readFileSync(new URL(`public/data/${k}.json`,root),'utf8'))]));
const errors=[],posts=[],calendars=[],downloads=[];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError',e=>errors.push(e.message));
const nativeCalls=[],nativeStore=new Map();
let locationAllowed=true,notificationAllowed=true;
async function launch(online=false,native=false) {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div><div id="toast"></div></body></html>',{url:'https://localhost/',runScripts:'outside-only',virtualConsole,pretendToBeVisual:true});
  const w=dom.window;
  w.scrollTo=()=>{};
  w.Blob=globalThis.Blob;w.TextEncoder=globalThis.TextEncoder;
  w.URL.createObjectURL=blob=>{calendars.push(blob);return 'blob:calendar-test';};
  w.URL.revokeObjectURL=()=>{};
  w.HTMLAnchorElement.prototype.click=function(){downloads.push({name:this.download,url:this.href});};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.AbortSignal=globalThis.AbortSignal;
  if(native){
    w.CapacitorCustomPlatform={name:'ios'};
    const methods={Preferences:['get','set'],Geolocation:['requestPermissions','getCurrentPosition'],Share:['share'],LocalNotifications:['requestPermissions','schedule','getPending','cancel','addListener','removeListener'],App:['addListener','removeListener'],BookishMap:['present'],CapacitorHttp:['request']};
    w.Capacitor={PluginHeaders:Object.entries(methods).map(([name,methods])=>({name,methods:methods.map(name=>({name,rtype:'promise'}))})),nativePromise:async(plugin,method,options={})=>{
      nativeCalls.push({plugin,method,options});
      if(plugin==='Preferences'){if(method==='get')return{value:nativeStore.get(options.key)??null};nativeStore.set(options.key,options.value);return{};}
      if(plugin==='Geolocation')return method==='requestPermissions'?{location:locationAllowed?'granted':'denied'}:{coords:{latitude:41.88,longitude:-87.63}};
      if(plugin==='LocalNotifications'){if(method==='requestPermissions')return{display:notificationAllowed?'granted':'denied'};if(method==='getPending')return{notifications:[]};return{};}
      if(plugin==='BookishMap')return{cityKey:'Chicago, IL'};
      if(plugin==='CapacitorHttp')return{status:503,data:{}};
      return{};
    }};
  }
  w.fetch=async(url,options={})=>{
    if(options.method==='POST'){posts.push({url,body:JSON.parse(options.body)});return{ok:true,json:async()=>({ok:true,status:'pending',host_notified:true})};}
    const key=String(url).match(/\/data\/(clubs|books|community)\.json/)?.[1];
    if(String(url).startsWith('https://meetbookish.com')&&!online)throw new Error('offline test');
    const value=key==='clubs'&&online?feeds.clubs.map((c,i)=>({...c,verified:i===0})):feeds[key];
    return{ok:true,json:async()=>JSON.parse(JSON.stringify(value))};
  };
  w.eval(script);
  await until(()=>w.document.querySelector('.club-open'));
  if(online)await until(()=>w.document.querySelector('.verified'));
  return dom;
}
async function until(fn){for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw new Error('UI state did not arrive');}
function click(w,selector){const el=w.document.querySelector(selector);assert.ok(el,`control ${selector}`);el.click();}
function input(w,selector,value,event='input'){const el=w.document.querySelector(selector);assert.ok(el,`input ${selector}`);el.value=value;el.dispatchEvent(new w.Event(event,{bubbles:true}));}

const offline=await launch(),w=offline.window;
assert.match(w.document.querySelector('h1').textContent,/Pull up a chair/);
assert.equal(w.document.querySelectorAll('.club-card').length,40);
click(w,'.save');await until(()=>w.document.querySelector('.save[aria-pressed=true]'));
click(w,'[data-tab=saved]');await until(()=>w.document.querySelector('h1').textContent.includes('collection'));
assert.equal(w.document.querySelectorAll('.club-card').length,1);
assert.equal(Object.keys(JSON.parse(w.localStorage.getItem('bookish.saved'))).length,1);
click(w,'.club-open');assert.ok(w.document.querySelector('#detail').open);
assert.ok(!w.document.querySelector('#join'));
const maps=w.document.querySelector('#detail a[href^="https://maps.apple.com/"]');assert.ok(maps);
input(w,'#remind input[name=meeting]','2030-01-01T18:00');
w.document.querySelector('#remind').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
await until(()=>w.document.querySelector('#remind .form-message').textContent.includes('Calendar file ready'));
assert.equal(downloads.at(-1).name,'bookish-meeting.ics');
assert.ok((await calendars.at(-1).text()).includes('DTSTART:20300101T180000Z'), 'download uses the selected meeting instant in UTC');
assert.equal(w.document.querySelector('#remind .primary').textContent,'Download calendar reminder');
click(w,'#close-detail');
click(w,'[data-tab=near]');await until(()=>w.document.querySelector('#city'));
input(w,'#city','Chicago, IL','change');await until(()=>w.document.querySelector('.list-heading h2').textContent==='Chicago, IL');
assert.ok([...w.document.querySelectorAll('.club-open p:first-of-type')].every(p=>p.textContent.includes('Chicago, IL')));
click(w,'[data-view=map]');assert.ok(w.document.querySelector('.city-links a'));
click(w,'[data-tab=read]');await until(()=>w.document.querySelector('[data-mood]'));
click(w,'[data-mood=big_fantasy]');click(w,'#next');click(w,'[data-length=any]');click(w,'#next');
input(w,'#book-search','fourth');click(w,'[data-loved=fourth-wing]');click(w,'#next');
await until(()=>w.document.querySelector('.book-card'));
assert.equal(w.document.querySelectorAll('.paper')[0].querySelectorAll('.book-card').length,3);
assert.match(w.document.querySelector('.book-card h3').textContent,/Iron Flame/);
assert.ok(w.document.querySelector('a.cover[href^="https://openlibrary.org/works/"] img[src^="https://covers.openlibrary.org/"]'));
click(w,'[data-book-save]');await until(()=>w.document.querySelector('[data-book-save][aria-pressed=true]'));
click(w,'[data-tab=saved]');await until(()=>w.document.querySelector('h1').textContent.includes('collection'));
assert.equal(w.document.querySelectorAll('.book-card').length,1);
click(w,'[data-tab=about]');assert.ok(w.document.querySelector('a[href="https://meetbookish.com/privacy/"]'));
assert.ok(w.document.querySelector('a[href="https://meetbookish.com/terms/"]'));
offline.window.close();

const online=await launch(true),v=online.window;
let now=Date.now();v.Date.now=()=>now;
click(v,'.verified .club-open');assert.ok(v.document.querySelector('#join'));
input(v,'#join [name=email]','reader@example.com');input(v,'#join [name=first_name]','Reader');
v.document.querySelector('#join [name=consent]').checked=true;now+=3000;
v.document.querySelector('#join').dispatchEvent(new v.Event('submit',{bubbles:true,cancelable:true}));
await until(()=>posts.length===1);
await until(()=>v.document.querySelector('.join-sent'));
assert.equal(v.document.querySelector('#detail-title').textContent,'Fingers crossed.');
assert.ok(v.document.querySelector('.sent-lede').textContent.includes(`with the host at ${feeds.clubs[0].name}.`));
assert.equal(v.document.querySelectorAll('.sent-steps li').length,3);assert.match(v.document.querySelector('.sent-steps .done').textContent,/Request sent\s*Today, /);
assert.ok(!v.document.querySelector('#join'),'Sent screen replaces the form');
click(v,'#sent-back');assert.ok(!v.document.querySelector('#join'),'Returning to the club does not offer a second request');
assert.match(v.document.querySelector('.join-section h2').textContent,/Request sent/);
assert.equal(v.document.activeElement,v.document.querySelector('.join-section h2'),'Back keeps focus in the sheet');
assert.match(posts[0].url,/\/bookish-join$/);assert.equal(posts[0].body.consent,true);assert.ok(posts[0].body.elapsed_ms>=2500);
assert.equal(posts[0].body.website,'');assert.equal(posts[0].body.club_id,feeds.clubs[0].id);
online.window.close();
const native=await launch(false,true),n=native.window;
locationAllowed=false;click(n,'#locate');await until(()=>n.document.querySelector('#toast').textContent.includes('Pick a city'));
assert.ok(n.document.querySelector('#city'));
locationAllowed=true;click(n,'#locate');await until(()=>n.document.querySelector('#toast').textContent.includes('location is ready'));
assert.ok(nativeCalls.some(c=>c.plugin==='Geolocation'&&c.method==='getCurrentPosition'));
assert.ok(![...nativeStore.keys()].some(k=>/location|position/.test(k)));
click(n,'[data-view=map]');await until(()=>n.document.querySelector('.list-heading h2').textContent==='Chicago, IL');
assert.ok(nativeCalls.find(c=>c.plugin==='BookishMap').options.cities.every(c=>Number.isFinite(c.lat)&&c.count>0));
click(n,'.club-open');click(n,'#share');await until(()=>nativeCalls.some(c=>c.plugin==='Share'));
assert.match(nativeCalls.find(c=>c.plugin==='Share').options.url,/meetbookish\.com\/book-clubs\/chicago-il\/#/);
input(n,'#remind input[name=meeting]','2030-01-01T18:00');
notificationAllowed=false;n.document.querySelector('#remind').dispatchEvent(new n.Event('submit',{bubbles:true,cancelable:true}));
await until(()=>n.document.querySelector('#remind .form-message').textContent.includes('Settings'));
assert.ok(!nativeCalls.some(c=>c.plugin==='LocalNotifications'&&c.method==='schedule'));
notificationAllowed=true;n.document.querySelector('#remind').dispatchEvent(new n.Event('submit',{bubbles:true,cancelable:true}));
await until(()=>nativeStore.has('bookish.reminders'));
const scheduled=nativeCalls.find(c=>c.plugin==='LocalNotifications'&&c.method==='schedule').options.notifications[0];
assert.ok(scheduled.id>0);assert.ok(scheduled.schedule.at instanceof n.Date,'Native reminder schedule.at must be a Date, not an ISO string.');assert.ok(scheduled.extra.clubId);
assert.equal(scheduled.schedule.at.getTime(),new Date('2030-01-01T18:00').getTime()-3600000);
await until(()=>n.document.querySelector('[data-cancel]'));click(n,'[data-cancel]');
await until(()=>JSON.parse(nativeStore.get('bookish.reminders'))&&Object.keys(JSON.parse(nativeStore.get('bookish.reminders'))).length===0);
assert.ok(nativeCalls.some(c=>c.plugin==='LocalNotifications'&&c.method==='cancel'&&c.options.notifications[0].id===scheduled.id));
native.window.close();
assert.deepEqual(errors,[]);
console.log('UI smoke passed: offline launch, clubs, city picker, map links, persistence, three-tap recommendations, covers, books, About, verified-only join payload and request-sent screen, browser reminder fallback; mocked native permission denial/recovery, location, MapKit bridge, sharing, reminder permission/scheduling/cancellation. No requests sent to a real host.');
