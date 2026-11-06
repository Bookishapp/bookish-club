// Capture the shipped app, never a review-only app route. All remote requests
// are intercepted before navigation, so authentication and mutations stay local.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createFixtureAPI, fixtureClub } from '../tests/fixtures.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const onlyLongEmail=process.argv.includes('--long-email-only');
const out=path.join(root,'docs/approved-art-parity',...(onlyLongEmail?['regressions/long-email-current']:[]));
const source=process.env.BOOKISH_APPROVED_SOURCE||'/Users/vahallo/ted-screenshots/bookish-club/full-app-1016';
const viewport={width:390,height:844};
const combined=new Set(['01','05','06','12','15','17','20','23','24','25','27','29','32','33','37']);
if(process.argv.includes('--pages-only')){const saved=JSON.parse(await fs.readFile(path.join(out,'manifest.json'),'utf8'));saved.captureComplete??=saved.captures.some(c=>c.id==='narrow-long-club-name');saved.validation={complete:saved.captureComplete,unexpectedExternalRequests:saved.blockedExternal.length,failedCaptures:saved.captures.filter(c=>c.checks.horizontalOverflow||c.checks.viewportMatches===false||c.checks.emDash||c.checks.emoji||c.checks.brokenImages.length||c.errors.length||c.missing.length).map(c=>c.id)};await writePages(saved);await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(saved,null,2)+'\n');process.exit(0);}
assert.match(os.hostname(),/mini/i,'Run browser work on the Mac mini.');
let playwright;
for(const module of [process.env.PLAYWRIGHT_MODULE,'playwright','/tmp/bookish-browser/node_modules/playwright/index.mjs','/tmp/wcdprobe/node_modules/playwright/index.mjs'].filter(Boolean)){
 try{playwright=await import(module);break;}catch{}
}
assert.ok(playwright,'Install Playwright, or set PLAYWRIGHT_MODULE to its index.mjs.');
await fs.mkdir(path.join(out,'built'),{recursive:true});
await fs.mkdir(path.join(out,'pages'),{recursive:true});
await fs.mkdir(path.join(out,'approved'),{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.svg':'image/svg+xml','.ico':'image/x-icon'};
const server=http.createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const relative=pathname.replace(/^\/app\//,'/').replace(/^\//,'')||'index.html';
  const file=path.resolve(root,'app/dist',relative);
  if(!file.startsWith(path.join(root,'app/dist')+path.sep))throw Error('Invalid path');
  const body=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(body);
 }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await playwright.chromium.launch({channel:'chrome',headless:true});
const manifest={generatedAt:new Date().toISOString(),browser:await browser.version(),channel:'chrome',host:os.hostname(),viewport,source,appBuild:[],captureComplete:false,captures:[],checks:[],limitations:[],blockedExternal:[]};
for(const file of ['index.html',...(await fs.readdir(path.join(root,'app/dist/assets'))).filter(f=>/\.(js|css)$/.test(f)).map(f=>'assets/'+f)])manifest.appBuild.push({file,sha256:crypto.createHash('sha256').update(await fs.readFile(path.join(root,'app/dist',file))).digest('hex')});
const receipts=JSON.parse(await fs.readFile(path.join(root,'docs/approved-art-parity/approved/approval-receipts.json'),'utf8'));
const receiptByScreen=new Map(receipts.map(r=>[r.screen,r]));
const active=new Set();
const onePixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const books=JSON.parse(await fs.readFile(path.join(root,'app/public/data/books.json'),'utf8'));
const coverNames={'fourth-wing':'cover-fourth-wing','iron-flame':'ironflame','yellowface':'cover-yellowface','the-god-of-the-woods':'godwoods','james':'james','tomorrow-and-tomorrow-and-tomorrow':'tomorrow','lessons-in-chemistry':'lessons','the-night-circus':'nightcircus','circe':'circe','a-court-of-thorns-and-roses':'acotar','the-seven-husbands-of-evelyn-hugo':'evelyn','funny-story':'funny','book-lovers':'emily','homecoming':'homecoming'};
const covers=new Map(books.filter(b=>coverNames[b.id]).map(b=>[String(b.c),path.join(source,'assets/covers',coverNames[b.id]+'.jpg')]));
const click=async(p,s)=>{await p.locator(s).first().click();};
const fill=async(p,s,v)=>{await p.locator(s).first().fill(v);};
const submit=async(p,s)=>{await p.locator(s).evaluate(f=>f.requestSubmit());};
const wait=async(p,s)=>{await p.locator(s).first().waitFor();};

async function launch(options={}){
 const api=createFixtureAPI(options),errors=[],missing=[],external=[],networkMessages=[];
 const context=await browser.newContext({viewport,deviceScaleFactor:1,isMobile:true,hasTouch:true,locale:'en-US',timezoneId:'America/Chicago',reducedMotion:'reduce'});
 active.add(context);
 if(options.storage)await context.addInitScript(items=>{for(const [k,v] of Object.entries(items))localStorage.setItem(k,JSON.stringify(v));},options.storage);
 const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
 p.on('console',m=>{if(m.type()==='error'){if(m.text().startsWith('Failed to load resource:'))networkMessages.push(m.text());else errors.push(m.text());}});
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.origin===origin){const response=await route.fetch();if(response.status()>=400)missing.push(`${response.status()} ${url.pathname}`);return route.fulfill({response});}
  if(url.hostname==='covers.openlibrary.org'){
   const cover=covers.get(url.pathname.match(/\/([0-9]+)-/)?.[1]);
   if(cover){try{return route.fulfill({status:200,contentType:'image/jpeg',body:await fs.readFile(cover)});}catch{}}
   return route.fulfill({status:200,contentType:'image/png',body:onePixel});
  }
  if(url.hostname.endsWith('.supabase.co')){
   if(options.loading&&url.pathname.endsWith('/bookish-directory'))await new Promise(r=>setTimeout(r,2500));
   if(options.offline&&url.pathname.endsWith('/bookish-directory'))return route.fulfill({status:503,json:{ok:false}});
   let result=await api.respond(req.url(),req.postDataJSON()||{},req.method());
   if(url.pathname.endsWith('/bookish-directory')){
    result={ok:true,clubs:options.empty?[]:[{...fixtureClub,id:'after-hours-chicago',club_id:fixtureClub.id,verified:true}, {...fixtureClub,id:'public-calendar-chicago',name:'The Neighborhood Chapter',verified:false,visibility:'open',source_name:'Public library calendar',source_url:'https://example.test/calendar'}]};
   }
   if(result?.$status&&url.pathname.endsWith('/bookish_schedule_meeting'))result.$status=503;
   if(options.noClub&&url.pathname.endsWith('/bookish_my_clubs'))result=[];
   if(options.emptyRoom&&url.pathname.endsWith('/bookish_club_home'))result={...result,current_book:null,meetings:[],votes:[]};
   if(options.long&&url.pathname.endsWith('/bookish_club_home'))result.club={...result.club,name:'The Very Long and Wonderfully Welcoming Neighborhood Readers Book Club for Every Kind of Chapter'};
   if(options.response)result=options.response(url,result);
   return route.fulfill({status:result?.$status||200,contentType:'application/json',body:JSON.stringify(result)});
  }
  external.push(`${req.method()} ${url.origin}${url.pathname}`);
  return route.fulfill({status:200,body:''});
 });
 await p.goto(origin+'/');
 if(!options.loading)await wait(p,'[data-tab=me]');
 return {p,api,context,errors,missing,external,networkMessages};
}
async function close(s){await s.context.close();active.delete(s.context);}
async function shot(s,id,title,approved,note='',focus){
 const {p}=s;
 await p.locator('#toast.visible').waitFor({state:'hidden',timeout:7000});
 if(focus)await p.locator(focus).first().evaluate(e=>e.scrollIntoView({block:'center',inline:'nearest'}));
 await p.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].filter(i=>i.loading!=='lazy').map(i=>i.decode().catch(()=>{})));});
 await p.waitForTimeout(90);
 const checks=await p.evaluate(expectedViewport=>{
  const dialog=document.querySelector('dialog[open]');
  const scope=dialog||document.body;
  const text=scope.innerText;
  return {horizontalOverflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)>expectedViewport.width+1||!!dialog&&dialog.scrollWidth>dialog.clientWidth+1,
   brokenImages:[...scope.querySelectorAll('img')].filter(i=>i.complete&&!i.naturalWidth).map(i=>i.getAttribute('src')),
   emDash:text.includes('\u2014'),emoji:/\p{Extended_Pictographic}/u.test(text),
   width:expectedViewport.width,height:expectedViewport.height,innerWidth,viewportMatches:Math.abs(innerWidth-expectedViewport.width)<=1,bodyWidth:document.body.scrollWidth,documentWidth:document.documentElement.scrollWidth,scrollHeight:scope.scrollHeight,
   codeLayout:document.querySelector('.code-field')?.getAttribute('data-code-length')||null,codeValid:document.querySelector('[name=token]')?.checkValidity()??null,
   dialog:!!dialog,focus:document.activeElement?.id||document.activeElement?.tagName};
 },p.viewportSize());
 const file=`built/${id}.jpg`;
 await p.screenshot({path:path.join(out,file),type:'jpeg',quality:88,animations:'disabled'});
 const entry={id,title,approved,note,image:file,checks,errors:[...s.errors],missing:[...s.missing],expectedNetworkMessages:[...s.networkMessages]};
 manifest.captures.push(entry);
 manifest.blockedExternal.push(...s.external);
 console.log(`${id}: ${checks.horizontalOverflow?'OVERFLOW':'captured'}`);
 return entry;
}
async function auth(s,{code='123456',termsShot=false}={}){
 const {p}=s;await click(p,'[data-tab=me]');await click(p,'#sign-in');await fill(p,'#account-email [name=email]','reviewer@example.test');await submit(p,'#account-email');await wait(p,'#account-code');
 await fill(p,'#account-code [name=token]',code);await submit(p,'#account-code');await wait(p,'#account-terms');
 if(termsShot)await shot(s,'04-house-rules','House rules, including working legal fields','04');
 await fill(p,'#account-terms [name=display_name]','Alex');await p.locator('[name=adult]').check();await p.locator('[name=terms]').check();await submit(p,'#account-terms');await p.waitForFunction(()=>!document.querySelector('#detail')?.open);
}
async function longEmail(){
 const email='a'.repeat(64)+'@example.test';
 const s=await launch({response:(url,result)=>url.pathname.endsWith('/bookish-auth')&&result?.session?{...result,session:{...result.session,user:{...result.session.user,email}}}:result});
 await auth(s);await shot(s,'29-profile-long-email','Account profile with a long email','29','A valid 64-character email local part exercises the account greeting beside approved art.');
 await s.p.setViewportSize({width:320,height:844});await shot(s,'29-profile-long-email-narrow','Account profile with a long email at 320 pixels','29','Additional narrow-device stress capture at 320 by 844.');await close(s);
}
async function home(s){await click(s.p,'[data-tab=me]');await click(s.p,'[data-home]');await wait(s.p,'.room-tabs');}

try{
 if(!onlyLongEmail){
 // Capture unchanged original approved HTML with its local fonts and artwork.
 const approvedContext=await browser.newContext({viewport,deviceScaleFactor:1});
 const approvedPage=await approvedContext.newPage();
 const originals=(await fs.readdir(path.join(source,'html'))).filter(f=>/^\d\d-.+\.html$/.test(f)).sort();
 manifest.approved=[];
 for(const file of originals){
  const id=file.slice(0,2),override=path.join(out,'approved',`${id}-v2.webp`);
  let image;
  try{await fs.access(override);image=`approved/${id}-v2.webp`;}catch{
   image=`approved/${id}.jpg`;
   await approvedPage.goto(pathToFileURL(path.join(source,'html',file)).href);
   await approvedPage.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));});
   await approvedPage.screenshot({path:path.join(out,image),type:'jpeg',quality:88});
  }
  if(id==='43')image='approved/20-v2.webp';
  const receipt=receiptByScreen.get(id);
  manifest.approved.push({id,title:receipt?.title||file.slice(3,-5).replaceAll('-',' '),source:path.join(source,'html',file),image,override:image.endsWith('-v2.webp'),receipt:receipt||null,superseded:['21','28'].includes(id)});
 }
 await approvedContext.close();

 let s=await launch();
 await shot(s,'07-near-me-list','Near me, list','07');
 await click(s.p,'[data-view=map]');await shot(s,'08-near-me-map','Near me, map with private city centers','08');
 await click(s.p,'[data-view=list]');await click(s.p,'.verified .club-open');await shot(s,'09-club-detail','Verified club detail','09');
 await shot(s,'06-reminder-explanation','Existing reminder permission explanation','06','No separate notification-prime page exists. This is the existing reminder explanation inside club detail.','#remind');
 await click(s.p,'#close-detail');await click(s.p,'.club-card:not(.verified) .club-open');await shot(s,'13-public-calendar','Unclaimed public-calendar club','13');
 await click(s.p,'#close-detail');await click(s.p,'[data-tab=me]');await shot(s,'01-welcome-equivalent','Signed-out account entry','01','No standalone welcome screen exists. The shipped signed-out Me entry is shown.');
 await click(s.p,'#open-resources');await shot(s,'resources','Existing Resources page',null,'Resources has no separate screen in the approved batch.');
 await click(s.p,'[data-tab=me]');await click(s.p,'#sign-in');await shot(s,'02-sign-in','Email sign-in','02');
 await click(s.p,'#use-password');await shot(s,'02-password','Existing password sign-in','02','Working password sign-in is retained, although the approved art only shows email entry.');await click(s.p,'#use-email');
 s.api.failNext('bookish-auth');await fill(s.p,'#account-email [name=email]','reviewer@example.test');await submit(s.p,'#account-email');await wait(s.p,'#account-email .form-message:not(:empty)');await shot(s,'02-sign-in-error','Sign-in form error','02');
 await submit(s.p,'#account-email');await wait(s.p,'#account-code');
 await fill(s.p,'#account-code [name=token]','1234');await shot(s,'03-code-four','Four-digit email code layout (UI support only)','03','The frontend input and layout support four digits. Authentication is intercepted locally; deployed server acceptance is not established by this capture.');assert.equal(await s.p.locator('.code-field').getAttribute('data-code-length'),'4');assert.equal(await s.p.locator('[name=token]').evaluate(i=>i.checkValidity()),true);
 await fill(s.p,'#account-code [name=token]','123456');await shot(s,'03-code-six','Six-digit email code layout','03');assert.equal(await s.p.locator('.code-field').getAttribute('data-code-length'),'6');assert.equal(await s.p.locator('[name=token]').evaluate(i=>i.checkValidity()),true);
 s.api.failNext('bookish-auth');await submit(s.p,'#account-code');await wait(s.p,'#account-code .form-message:not(:empty)');await shot(s,'03-code-error','Email-code validation error','03');
 await submit(s.p,'#account-code');await wait(s.p,'#account-terms');await shot(s,'04-house-rules','House rules, legal fields, and age confirmation','04');
 await fill(s.p,'#account-terms [name=display_name]','Alex');await s.p.locator('[name=adult]').check();await s.p.locator('[name=terms]').check();await submit(s.p,'#account-terms');await s.p.waitForFunction(()=>!document.querySelector('#detail')?.open);
 await shot(s,'29-profile','Account profile and clubs','29');
 await click(s.p,'#account-settings');await shot(s,'30-settings','Settings and privacy','30');
 await click(s.p,'#delete-account');await shot(s,'delete-account','Account deletion confirmation','30','Existing destructive-action confirmation is retained.');await click(s.p,'#community-close');
 await click(s.p,'#create-club');await shot(s,'31-create-club','Create club, including visibility and location fields','31');await click(s.p,'#community-close');
 await click(s.p,'#redeem-invite');await shot(s,'27-redeem-invite','Redeem an invitation','27','The existing flow uses an invite-code form. Share invitation is captured separately.');await click(s.p,'#community-close');
 await click(s.p,'[data-tab=near]');await click(s.p,'.verified .club-open');await click(s.p,'#account-join-club');await wait(s.p,'#account-join');await shot(s,'10-join-request','Private-club join request','10');
 await fill(s.p,'#account-join [name=note]','I love a good mystery, a warm welcome, and an unrushed discussion.');await submit(s.p,'#account-join');await wait(s.p,'#reload-account');await shot(s,'11-join-sent','Join request sent','11');await click(s.p,'#community-close');
 await home(s);await shot(s,'17-club-home','Existing club home','17','The app combines its current book, meeting details, and safety controls in club home. No Tea feed has been added.');
 await shot(s,'20-current-book','Current book in existing club home','20','The app has a shared current-book section. Reading-progress tracking is absent.','.room-book');
 await shot(s,'24-meeting','Member-only meeting details','24','Existing app has meeting details, with calendar reminders in public detail. It has no in-app RSVP action.','.meeting-card');
 await click(s.p,'[data-room-tab=members]');await shot(s,'26-members','Club members','26');await click(s.p,'[data-kind=member]');await shot(s,'safety','Report or block a reader','26','Existing safety form, with no new content model.');await click(s.p,'#back-club-home');
 await click(s.p,'[data-room-tab=votes]');await shot(s,'22-vote','Anonymous book vote','22');await click(s.p,'[data-ballot]');await wait(s.p,'[data-ballot][aria-pressed=true]');await shot(s,'22-vote-selected','Anonymous vote, selected choice','22');await click(s.p,'[data-close-vote]');await wait(s.p,'.vote-card');await shot(s,'23-vote-winner','Closed vote and winning book','23','The existing closed-vote panel remains inside Votes, and the winning book updates club home.');
 await shot(s,'22-open-vote','Host anonymous vote form','22','Existing host form opens after the previous vote closes.','#room-vote');
 await click(s.p,'[data-room-tab=manage]');await shot(s,'host-desk','Host desk and pending join request','26','Host controls and pending reader approvals share the existing Host desk.');await click(s.p,'#rotate-invite');await wait(s.p,'.invite-code');await shot(s,'27-share-invite','Share invitation from Host desk','27','The real browser share action is not triggered; it would hand off to the operating system.','.invite-code');
 await shot(s,'25-schedule-meeting','Host meeting scheduling form','25','Meeting scheduling stays inside Host desk.','#room-meeting');
 await fill(s.p,'#room-meeting [name=title]','A cozy December chapter');await fill(s.p,'#room-meeting [name=starts]','2030-12-05T18:30');await fill(s.p,'#room-meeting [name=location]','The neighborhood library reading room');s.api.failNext('bookish_schedule_meeting');await submit(s.p,'#room-meeting');await wait(s.p,'#room-meeting .form-message:not(:empty)');await shot(s,'25-schedule-error','Meeting form save error','25','A fixture rejects the save, and the real form retains the draft.','#room-meeting .form-message');
 await click(s.p,'#community-close');await click(s.p,'[data-tab=read]');await shot(s,'05-taste-mood','Taste, mood selection','05');await click(s.p,'[data-mood=big_fantasy]');await click(s.p,'#next');await shot(s,'05-taste-length','Taste, reading length','05');await click(s.p,'[data-length=any]');await click(s.p,'#next');await fill(s.p,'#book-search','fourth');await shot(s,'05-taste-book','Taste, favorite book search','05');await click(s.p,'[data-loved=fourth-wing]');await click(s.p,'#next');await wait(s.p,'.book-card');await shot(s,'14-read-next','Read next recommendations','14');
 await shot(s,'15-book-equivalent','Existing book card and Open Library link','15','No in-app book-detail route exists. The real book card links to Open Library.','.book-card');await click(s.p,'[data-book-save]');await click(s.p,'[data-tab=near]');await click(s.p,'.save');await click(s.p,'[data-tab=saved]');await shot(s,'16-saved','Saved clubs and books','16');await close(s);

 s=await launch({empty:true});await shot(s,'34-empty-near','Empty club directory','34');await shot(s,'34-empty-near-card','Empty directory action','34','Scrolled to the actual empty state and retry action.','.empty-state');await click(s.p,'[data-tab=saved]');await shot(s,'35-empty-saved','Empty Saved','35');await close(s);
 s=await launch({offline:true});await shot(s,'directory-error','Directory network error and retry','34','Scrolled to the actual network error and retry action.','.network-state');await close(s);
 s=await launch({loading:true});await wait(s.p,'.loading');await shot(s,'loading','App loading state',null,'The actual launch screen is held by delaying the local directory fixture.');await close(s);
 s=await launch({emptyRoom:true,noClub:true,member:false});await auth(s,{code:'1234'});await shot(s,'37-no-club','Signed-in account without a club','37');await click(s.p,'#redeem-invite');await fill(s.p,'#account-invite [name=code]','READTOGETHER');await submit(s.p,'#account-invite');await wait(s.p,'.room-tabs');await shot(s,'12-join-approved','Joined club after redeeming invitation','12','No standalone join-approved page exists. A successful join opens the actual club home.');await shot(s,'33-empty-club','Club home without a book or meeting','33','No Tea feed exists. This is the actual empty current-book and calendar state.');await click(s.p,'[data-room-tab=votes]');await shot(s,'empty-votes','No active book votes','22');await close(s);
 s=await launch({role:'member'});await auth(s);await home(s);await shot(s,'member-club-home','Member club view without host controls','17','The member fixture has no Host desk controls.');assert.equal(await s.p.locator('[data-room-tab=manage]').count(),0);await close(s);
 s=await launch({member:false});await auth(s);await click(s.p,'#create-club');await fill(s.p,'#account-create [name=name]','The Saturday Chapter');await fill(s.p,'#account-create [name=city]','Chicago');await fill(s.p,'#account-create [name=state]','IL');await submit(s.p,'#account-create');await wait(s.p,'.room-tabs');await shot(s,'32-club-started','Created club opens its working club home','32','No standalone club-started screen exists. The actual create flow opens club home.');await close(s);
 s=await launch({long:true});await auth(s);await home(s);await shot(s,'long-club-name','Long club name on iPhone width','09','Long fixture data exercises the existing app layout.');await s.p.setViewportSize({width:320,height:844});await shot(s,'narrow-long-club-name','Long club name at 320 pixels','09','Additional narrow-device stress capture; this one intentionally uses a 320 by 844 viewport.');await close(s);

 }
 await longEmail();
 manifest.captureComplete=true;
 manifest.limitations=[
  'Four-digit code evidence establishes frontend input and layout support only. Authentication uses intercepted fixtures. The current server accepts six to ten digits; four-digit backend delivery and acceptance are pending separate PR 36.',
  '390 by 844 is a CSS viewport in Google Chrome on the Mac mini, not a native iPhone simulator or a system keyboard capture.',
  'The bundle is served unchanged from app/dist. Fixture identities, intercepted RPC responses, and local cover mirrors exist only in this Node capture process.',
  'Book covers found in the approved source are served as local mirrors. Unmapped covers receive a one-pixel response and exercise the existing typographic-cover fallback.',
  'Welcome, notification prime, book detail, join approved, club started, meeting RSVP, and invite share sheet are combined flows or lack a separate existing app screen. Captures disclose the actual equivalent; they do not establish exact screen parity.',
  'Tea composer, Tea thread, page logging, notification inbox, and widgets do not exist in this app and were not added. Reading scores and races are prohibited.',
  'Native Messages evidence is separate from these Chrome captures. Browser evidence cannot establish Messages transport or accessibility behavior.',
 ];
}catch(error){manifest.failure={message:error.message};throw error;}finally{
 for(const context of active)await context.close();
 await browser.close();await new Promise(resolve=>server.close(resolve));
 // Keep partial evidence on failure, with the exception still propagated.
 manifest.blockedExternal=[...new Set(manifest.blockedExternal)];
 manifest.validation={complete:manifest.captureComplete,unexpectedExternalRequests:manifest.blockedExternal.length,failedCaptures:manifest.captures.filter(c=>c.checks.horizontalOverflow||c.checks.viewportMatches===false||c.checks.emDash||c.checks.emoji||c.checks.brokenImages.length||c.errors.length||c.missing.length).map(c=>c.id)};
 await writePages(manifest);
 await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
}
const failures=manifest.captures.filter(c=>c.checks.horizontalOverflow||c.checks.viewportMatches===false||c.checks.emDash||c.checks.emoji||c.checks.brokenImages.length||c.errors.length||c.missing.length);
assert.equal(manifest.blockedExternal.length,0,'Unexpected remote requests were blocked.');
assert.deepEqual(failures.map(c=>({id:c.id,checks:c.checks,errors:c.errors,missing:c.missing})),[],'Capture checks failed. See manifest.json.');
console.log(`Verified ${manifest.captures.length} app captures. Review ${path.relative(root,out)}/index.html.`);

async function writePages(manifest){
 const codeLimit='Four-digit code evidence establishes frontend input and layout support only. Authentication uses intercepted fixtures. The current server accepts six to ten digits; four-digit backend delivery and acceptance are pending separate PR 36.';
 if(!manifest.limitations.includes(codeLimit))manifest.limitations.unshift(codeLimit);
 for(const file of await fs.readdir(path.join(out,'pages')))if(/\.(html|md)$/.test(file))await fs.unlink(path.join(out,'pages',file));
 const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 const style=`body{margin:0;background:#f5ead8;color:#2a0f15;font:16px/1.6 system-ui,sans-serif}main{max-width:1100px;padding:24px;margin:auto}a{color:#7a1a2a}h1{font:36px/1.15 Georgia,serif}h2{font:24px Georgia,serif}figure{margin:0}img{display:block;max-width:100%;height:auto;border-radius:12px;box-shadow:0 4px 20px #2a0f1525}.pair{display:flex;gap:28px;align-items:flex-start;flex-wrap:wrap}.pair figure{width:390px}.pair img{width:390px}figcaption{padding:10px 0}table{border-collapse:collapse;width:100%;background:#fffaf1}td,th{text-align:left;border-bottom:1px solid #decdbc;padding:10px;vertical-align:top}.note{max-width:850px}.badge{font-size:13px;font-weight:700}code{font-size:13px;overflow-wrap:anywhere}.checks{font-size:14px}`;
 const doc=(title,body)=>`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} | Bookish parity</title><style>${style}</style><main>${body}</main></html>`;
 const nativeMap={
  '38':{files:['drawer-icon'],note:'Bundled icon preview in an isolated native review host. Apple’s Messages drawer is not captured.'},
  '39':{files:['stickers'],note:'Actual native sticker browser in an isolated UIKit review host. The existing fourteen sticker identifiers are retained.'},
  '40':{files:['editor-vote','editor-vote-scrolled','editor-vote-error-scrolled','editor-vote-large-type','editor-vote-large-type-scrolled'],note:'Actual production vote editor in a standalone simulator host, including error and large-text states. Apple’s conversation, keyboard, and transport are not captured.'},
  '41':{files:['transcript-vote'],note:'Actual CardRenderer output hosted in UIKit. Apple’s Messages transcript chrome and transport are not captured.'},
  '42':{files:['transcript-rsvp','editor-rsvp','transcript-rsvp-long'],note:'Actual RSVP card and editor in the native review host. Apple’s host, incoming delivery, and send transport require device validation.'},
  '43':{files:['transcript-bookmarks','editor-bookmarks','transcript-bookmarks-empty'],note:'Actual communal bookmarks card and editor follow the v2 reading-together reference. Member order is preserved, with no ranked reading view.'},
 };
 manifest.nativeEvidence=[];
 try{const native=JSON.parse(await fs.readFile(path.join(root,'docs/approved-art-parity/native/capture-manifest.json'),'utf8'));manifest.nativeCapture={manifest:'native/capture-manifest.json',capturedAt:native.capturedAt,device:native.device,runtime:native.runtime,screenSizePoints:native.screenSizePoints,host:native.host,limitations:native.limitations,simulatorScreenshots:native.screenshots.filter(s=>s.path.startsWith('actual/')).length,exactCardImages:native.screenshots.filter(s=>s.path.startsWith('cards/')).length};}catch{}
 const rows=[],markdownRows=[];
 for(const reference of manifest.approved||[]){
  if(reference.id==='20')reference.title='Current book and reading together (v2)';
  if(reference.id==='43')reference.title='Reading together (v2)';
  const captures=manifest.captures.filter(c=>c.approved===reference.id);
  for(const capture of captures){if(capture.id==='03-code-four'){capture.title='Four-digit email code layout (UI support only)';capture.note='The frontend input and layout support four digits. Authentication is intercepted locally; deployed server acceptance is not established by this capture.';}if(capture.id==='03-code-six')capture.title='Six-digit email code layout';}
  const native=Number(reference.id)>=38&&Number(reference.id)<=45;
  const nativeDefinition=nativeMap[reference.id],nativeImages=[];
  for(const file of nativeDefinition?.files||[]){const image=`native/actual/${file}.png`;try{await fs.access(path.join(root,'docs/approved-art-parity',image));nativeImages.push(image);}catch{}}
  if(nativeImages.length)manifest.nativeEvidence.push({reference:reference.id,images:nativeImages,note:nativeDefinition.note});
  const absent=!captures.length;
  const status=nativeImages.length?'Partial: native UIKit review host':native?'Absent native behavior':absent?'Absent':combined.has(reference.id)?'Partial: existing combined flow':'Existing surface: visual adaptation';
  reference.status=status;
  const note=nativeImages.length?nativeDefinition.note:native?'No existing native surface implements this approved concept. See the native evidence limitations.':absent?'No existing app surface is implemented for this approved concept. No app screenshot was fabricated.':'';
  const name=path.basename(reference.source);
  await fs.writeFile(path.join(out,'pages',name),doc(`${reference.id} ${reference.title}`,`<a href="../index.html">All screens</a><h1>${esc(reference.id)}. ${esc(reference.title)}</h1><p class="badge">${reference.override?'Oct 19 approved v2 override':reference.superseded?'Superseded Oct 18 reference; Oct 19 v2 takes precedence':reference.receipt?'Oct 18 approval receipt verified':'Oct 18 batch reference; individual approval not recorded in decisions 111-143'}</p><p class="badge">${esc(status)}</p><p class="note">${esc(note)}</p><p class="note">${combined.has(reference.id)?'This is a partial mapping to working app behavior. The original screen composition and separate navigation are not fully implemented.':''}</p>${nativeImages.length?`<p><a href="../native/README.md">Native provenance, reproduction, and device-validation limits</a></p><div class="pair"><figure><figcaption>Approved reference</figcaption><img src="../${reference.image}" alt="Approved ${esc(reference.title)}"></figure><figure><figcaption>Actual UIKit content in standalone simulator host</figcaption><img src="../${nativeImages[0]}" alt="Actual native ${esc(reference.title)}"></figure></div><p>Additional actual native states: ${nativeImages.map(image=>`<a href="../${image}">${esc(path.basename(image,'.png').replaceAll('-',' '))}</a>`).join(', ')}.</p>`:captures.length?captures.map(c=>`<h2>${esc(c.title)}</h2><p class="note">${esc(c.note)}</p><div class="pair"><figure><figcaption>Approved reference</figcaption><img src="../${reference.image}" alt="Approved ${esc(reference.title)}"></figure><figure><figcaption>Actual app, ${c.checks.width} by ${c.checks.height}</figcaption><img src="../${c.image}" alt="Actual app ${esc(c.title)}"></figure></div><p class="checks">Overflow: ${c.checks.horizontalOverflow?'FAIL':'none'}. Missing local assets: ${c.missing.length}. Browser errors: ${c.errors.length}. Em dash or emoji: ${c.checks.emDash||c.checks.emoji?'FAIL':'none'}.</p>`).join(''):`<figure><img src="../${reference.image}" width="390" alt="Approved ${esc(reference.title)}"><figcaption>Approved reference only. ${esc(note)}</figcaption></figure>`}<p>Original source: <code>${esc(reference.source)}</code></p>`));
  const approval=reference.override?'Oct 19 approved v2 override':reference.superseded?'Superseded Oct 18 reference; Oct 19 v2 takes precedence':reference.receipt?'Oct 18 approval receipt verified':'Oct 18 batch reference; individual approval not recorded in decisions 111-143';
  const sections=[`[All screens](../INDEX.md)\n\n# ${reference.id}. ${reference.title}\n\n${approval}.\n\n**${status}**\n\n${note}`];
  if(combined.has(reference.id))sections.push('This is a partial mapping to working app behavior. The original screen composition and separate navigation are not fully implemented.');
  if(nativeImages.length){
   sections.push(`[Native provenance, reproduction, and device-validation limits](../native/README.md).\n\n| Approved reference | Actual UIKit content in standalone simulator host |\n| --- | --- |\n| ![Approved ${reference.title}](../${reference.image}) | ![Actual native ${reference.title}](../${nativeImages[0]}) |`);
   sections.push(`Additional actual native states: ${nativeImages.map(image=>`[${path.basename(image,'.png').replaceAll('-',' ')}](../${image})`).join(', ')}.`);
  }else if(captures.length){
   for(const capture of captures)sections.push(`## ${capture.title}\n\n${capture.note}\n\n| Approved reference | Actual app, ${capture.checks.width} by ${capture.checks.height} |\n| --- | --- |\n| ![Approved ${reference.title}](../${reference.image}) | ![Actual app ${capture.title}](../${capture.image}) |\n\nOverflow: ${capture.checks.horizontalOverflow?'FAIL':'none'}. Missing local assets: ${capture.missing.length}. Browser errors: ${capture.errors.length}. Em dash or emoji: ${capture.checks.emDash||capture.checks.emoji?'FAIL':'none'}.`);
  }else sections.push(`![Reference ${reference.title}](../${reference.image})\n\nReference only. ${note}`);
  sections.push(`Original source: \`${reference.source}\`.`);
  await fs.writeFile(path.join(out,'pages',name.replace(/\.html$/,'.md')),sections.join('\n\n')+'\n');
  markdownRows.push(`| [${reference.id}. ${reference.title}](pages/${name.replace(/\.html$/,'.md')}) | ${status} | ${captures.map(c=>c.title).join('; ')||note} |`);
  rows.push(`<tr><td><a href="pages/${name}">${reference.id}. ${esc(reference.title)}</a>${reference.override?' (v2)':''}</td><td><strong>${esc(status)}</strong><br>${captures.map(c=>esc(c.title)).join('<br>')||esc(nativeImages.length?nativeDefinition.note:note)}</td></tr>`);
 }
 const extras=manifest.captures.filter(c=>!c.approved||!(manifest.approved||[]).some(r=>r.id===c.approved));
 await fs.writeFile(path.join(out,'pages','additional-states.html'),doc('Additional existing states',`<a href="../index.html">All screens</a><h1>Additional existing states</h1>${extras.map(c=>`<h2>${esc(c.title)}</h2><p>${esc(c.note)}</p><img width="390" src="../${c.image}" alt="${esc(c.title)}">`).join('')}`));
 await fs.writeFile(path.join(out,'pages','additional-states.md'),`[All screens](../INDEX.md)\n\n# Additional existing states\n\n${extras.map(c=>`## ${c.title}\n\n${c.note}\n\n![${c.title}](../${c.image})`).join('\n\n')}\n`);
 await fs.writeFile(path.join(out,'INDEX.md'),`# Bookish approved art comparisons\n\n${manifest.captures.length} actual app captures through the working UI in Google Chrome. The normal viewport is 390 by 844, with additional 320 by 844 stress cases. Capture run: ${manifest.captureComplete?'complete':'incomplete'}. Visual implementation: partial where marked below.\n\nReferences from the 47-screen batch and actual existing app surfaces are shown side by side. Individual approval receipts are recorded for 33 original screens and eight v2 overrides. Other source screens are labeled as references. This packet documents visual adaptation and partial coverage, not exact parity with every approved composition.\n\nCaptured ${manifest.generatedAt}, using Chrome ${manifest.browser} on ${manifest.host}.\n\n[Capture manifest and checks](manifest.json), [individual approval receipts](approved/approval-receipts.json), [v2 provenance](approved/v2-sources.json), [additional loading and resource states](pages/additional-states.md), [native evidence and limitations](native/README.md), [native image dimensions and hashes](native/capture-manifest.json), and [HTML comparison index](index.html).\n\n| Source screen | Status | Actual existing app coverage |\n| --- | --- | --- |\n${markdownRows.join('\n')}\n\n## Limits\n\n${manifest.limitations.map(l=>`- ${l}`).join('\n')}\n\n## Reproduce\n\n\`\`\`sh\nnpm run build --prefix app\nnode app/scripts/capture-parity.mjs\n\`\`\`\n\nSet \`PLAYWRIGHT_MODULE\` to an installed Playwright module if needed, and \`BOOKISH_APPROVED_SOURCE\` if the approved source directory differs. The script launches installed Google Chrome, serves the production bundle on loopback, and intercepts all external requests. No request reaches an external write service. Regenerate companion pages without recapture with \`node app/scripts/capture-parity.mjs --pages-only\`.\n\nSource of truth: \`/Users/vahallo/biz/bookish/design/APPROVED-ART.md\`. October 19 v2 images take precedence where present. Working behavior, legal text, and privacy rules take precedence over approved mock data.\n`);
 await fs.writeFile(path.join(out,'index.html'),doc('Approved art comparisons',`<h1>Bookish approved art comparisons</h1><p>Actual app screenshots captured through the working UI in Google Chrome, at a 390 by 844 CSS viewport, with additional 320 by 844 stress cases. References from the 47-screen batch and existing app surfaces are shown side by side. Individual approval receipts are recorded for 33 original screens and eight v2 overrides; other source screens are labeled as references. This packet documents visual adaptation and partial coverage, not exact parity with every approved composition. The table discloses combined flows and concepts that do not exist in this app.</p><p class="badge">Capture run: ${manifest.captureComplete?'complete':'incomplete'}. Visual implementation: partial where marked below.</p><p>${esc(manifest.generatedAt)}. Chrome ${esc(manifest.browser)} on ${esc(manifest.host)}. ${manifest.captures.length} app captures.</p><p><a href="manifest.json">Machine-readable capture manifest and checks</a> · <a href="approved/v2-sources.json">Approved v2 provenance</a> · <a href="approved/approval-receipts.json">Individual approval receipts</a> · <a href="pages/additional-states.html">Additional loading and resource states</a> · <a href="native/README.md">Native Messages evidence</a> · <a href="native/capture-manifest.json">Native image dimensions and hashes</a></p><p>Reproduce after building: <code>cd app &amp;&amp; npm run build &amp;&amp; node scripts/capture-parity.mjs</code>. Set <code>PLAYWRIGHT_MODULE</code> if Playwright is not installed locally. The script always launches the installed Google Chrome channel, serves the production bundle on loopback, and intercepts all external requests. No request reaches an external write service.</p><h2>Coverage</h2><table><thead><tr><th>Approved screen</th><th>Actual existing app coverage</th></tr></thead><tbody>${rows.join('')}</tbody></table><h2>Limits</h2><ul>${manifest.limitations.map(l=>`<li>${esc(l)}</li>`).join('')}</ul><p>Source of truth: <code>/Users/vahallo/biz/bookish/design/APPROVED-ART.md</code>. October 19 v2 images take precedence where present. Working behavior, legal text, and privacy rules take precedence over approved mock data.</p>`));
}
