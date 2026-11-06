// Capture the actual production bundle through public UI controls in installed
// Google Chrome. Every hosted request is intercepted before the first navigation.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createV3FixtureAPI, ids } from '../tests/v3-fixtures.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const source=process.env.BOOKISH_V3_SOURCE||'/Users/vahallo/biz/bookish/design/approved-v3-1021';
const out=process.env.BOOKISH_V3_OUT||'/Users/vahallo/ted-ops/oneshots/1106-bookish-v3art/parity';
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const viewport={width:390,height:844};
const definitions=[['welcome','01-welcome'],['bring-your-club','02-bring-your-club'],['house-rules','03-house-rules'],['the-tea','04-the-tea'],['spill-a-take','05-spill-a-take'],['reading-together','06-reading-together'],['log-my-page','07-log-my-page'],['meeting-rsvp','08-meeting-rsvp'],['book-vote','09-book-vote'],['rate-the-book','09b-rate-the-book'],['our-shelf','09c-our-shelf'],['up-next-for-you','09d-up-next-for-you'],['members','10-members'],['club-privacy','11-club-privacy'],['notifications','12-notifications'],['settings','13-settings'],['join-sent','14-join-sent'],['find-a-club','15-find-a-club'],['menu','16-menu']].map(([name,sourceSuffix],i)=>({id:String(i+1).padStart(2,'0'),name,source:`app-${String(i+1).padStart(2,'0')}-${sourceSuffix}.png`}));
const arg=process.argv.find(v=>v.startsWith('--screens='));
const requested=arg?new Set(arg.split('=')[1].split(',').map(s=>s.padStart(2,'0'))):new Set(definitions.map(d=>d.id));
assert.ok([...requested].every(id=>definitions.some(d=>d.id===id)),'--screens must contain indices 01 through 19.');
if(process.argv.includes('--list')){console.log(definitions.map(d=>`${d.id} ${d.name}`).join('\n'));process.exit(0);}
assert.match(os.hostname(),/mini/i,'All browser capture must run on the Mac mini.');
await fs.access(chrome);
let playwright;
for(const module of [process.env.PLAYWRIGHT_MODULE,'playwright','/tmp/bookish-browser/node_modules/playwright/index.mjs','/Users/vahallo/ted-ops/oneshots/1105-bookish40-fix/browser/node_modules/playwright/index.mjs','/tmp/wcdprobe/node_modules/playwright/index.mjs'].filter(Boolean)){try{playwright=await import(module);break;}catch{}}
assert.ok(playwright,'Set PLAYWRIGHT_MODULE to an installed Playwright index.mjs.');
await fs.mkdir(path.join(out,'built'),{recursive:true});
const sha=async file=>crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.svg':'image/svg+xml','.ico':'image/x-icon'};
const dist=path.join(root,'app/dist');
const buildFiles=['index.html',...(await fs.readdir(path.join(dist,'assets'))).filter(f=>/\.(js|css)$/.test(f)).map(f=>'assets/'+f)];
for(const file of buildFiles)await fs.access(path.join(dist,file));
const server=http.createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),relative=pathname.replace(/^\/app\//,'/').replace(/^\//,'')||'index.html',file=path.resolve(dist,relative);assert.ok(file.startsWith(dist+path.sep));res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(await fs.readFile(file));}catch{res.writeHead(404);res.end('Not found');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await playwright.chromium.launch({executablePath:chrome,headless:true});
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const manifest={generatedAt:new Date().toISOString(),host:os.hostname(),browser:'Google Chrome',browserVersion:await browser.version(),executablePath:chrome,viewport,deviceScaleFactor:1,origin,source,commit:git('rev-parse','HEAD'),workingTree:git('status','--short'),fixture:{file:'app/tests/v3-fixtures.mjs',sha256:await sha(path.join(root,'app/tests/v3-fixtures.mjs')),clock:'2026-10-21T16:41:00.000Z',user:'Nina',club:'Unhinged Annotators',book:'Pride and Prejudice',page:247},script:{file:'app/scripts/capture-v3.mjs',sha256:await sha(fileURLToPath(import.meta.url))},build:[],captures:[],failures:[],hostedRequests:[],unexpectedExternal:[],complete:false,limitations:['Screens capture the real local production web bundle with review fixture API responses, a fixed fixture clock, and real UI navigation. They do not establish deployed service behavior or native device behavior.','Approved source PNGs are preserved. Comparison composition resizes the approved reference to 390 by 844; the actual app screenshot is never altered.','Current-book rating aggregates use five raters because the checked library contract suppresses aggregates below five. Approved art shows four raters.','Vote fixtures retain aggregate totals and one private current-user choice. Approved art shows two choices and voter identities, which the current checked voting contract does not expose.','The Nina fixture account has a host role so host-only controls are exercised. Member display rows preserve Jess as host and Priya as cohost from the art.','No numerical visual parity score is assigned.']};
for(const name of buildFiles)manifest.build.push({file:name,sha256:await sha(path.join(dist,name))});
const sessions=[];
async function launch(options={}){
 const context=await browser.newContext({viewport,deviceScaleFactor:1,isMobile:true,hasTouch:true,locale:'en-US',timezoneId:'America/Chicago',reducedMotion:'reduce',serviceWorkers:'block'});
 const p=await context.newPage();p.setDefaultTimeout(7000);
 const s={p,context,api:createV3FixtureAPI(options),steps:[],errors:[],missing:[]};sessions.push(s);
 await context.addInitScript(()=>{const NativeDate=Date,now=NativeDate.parse('2026-10-21T16:41:00.000Z');globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};});
 p.on('pageerror',e=>s.errors.push(e.message));
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  try{
   if(url.origin===origin){const response=await route.fetch();if(response.status()>=400)s.missing.push(`${response.status()} ${url.pathname}`);return route.fulfill({response});}
   if(url.hostname.endsWith('.supabase.co')){let body={};try{body=req.postDataJSON()||{};}catch{}const result=await s.api.respond(req.url(),body,req.method());manifest.hostedRequests.push({method:req.method(),path:url.pathname,intercepted:true});return route.fulfill({status:result?.$status||200,contentType:typeof result==='string'?'text/calendar':'application/json',body:typeof result==='string'?result:JSON.stringify(result)});}
   if(url.hostname==='covers.openlibrary.org'){
    const id=url.pathname.match(/\/([0-9]+)-/)?.[1],books=JSON.parse(await fs.readFile(path.join(root,'app/public/data/books.json'),'utf8')),book=books.find(b=>String(b.c)===id);
    if(book){try{return route.fulfill({status:200,contentType:'image/jpeg',body:await fs.readFile(path.join(root,'app/public/covers',book.id+'.jpg'))});}catch{}}
   }
   manifest.unexpectedExternal.push({method:req.method(),url:req.url(),intercepted:true});return route.fulfill({status:451,body:'External request blocked by local capture harness'});
  }catch(e){s.errors.push(e.message);return route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'Local fixture request failed'})});}
 });
 await p.goto(origin);await p.locator('#welcome-find, [data-tab=me]').first().waitFor();
 return s;
}
async function click(s,selector){const loc=s.p.locator(selector).first();if(!await loc.isVisible()){const menu=s.p.locator('#open-menu');if(await menu.isVisible()){s.steps.push({action:'click',selector:'#open-menu'});await menu.click();}else{const summary=s.p.locator('.room-section-menu > summary');if(await summary.isVisible()){s.steps.push({action:'click',selector:'.room-section-menu > summary'});await summary.click();}}}s.steps.push({action:'click',selector});await loc.click();}
async function fill(s,selector,value){s.steps.push({action:'fill',selector,value});await s.p.locator(selector).first().fill(value);}
async function submit(s,selector){await click(s,`${selector} button[type=submit]`);}
async function dismissWelcome(s){if(await s.p.locator('#welcome-find').isVisible())await click(s,'#welcome-find');}
async function auth(s,{rules=false,create=false}={}){
 if(create&&await s.p.locator('#create-club').isVisible())await click(s,'#create-club');
 else if(await s.p.locator('#sign-in').isVisible())await click(s,'#sign-in');
 else{await dismissWelcome(s);await click(s,'[data-tab=me]');await click(s,'#sign-in');}
 await fill(s,'#account-email [name=email]','nina@example.test');await submit(s,'#account-email');
 await s.p.locator('#account-code').waitFor();await fill(s,'#account-code [name=token]','123456');await submit(s,'#account-code');
 await s.p.locator('#account-terms').waitFor();if(rules)return;
 await fill(s,'#account-terms [name=display_name]','Nina');
 const city=s.p.locator('#account-terms [name=home_city]');if(await city.count())await fill(s,'#account-terms [name=home_city]','Austin');
 for(const name of ['adult','terms']){const check=s.p.locator(`#account-terms [name=${name}]`);if(await check.count())await check.check();}
 await submit(s,'#account-terms');await s.p.locator('#account-terms').waitFor({state:'detached'});
 if(create&&!await s.p.locator('#account-create').isVisible())await click(s,'#create-club');
}
async function home(s){
 await auth(s);if(await s.p.locator('#welcome-find').isVisible())await dismissWelcome(s);
 if(!await s.p.locator('[data-community=home]').count()){
  const close=s.p.locator('#community-close');if(await close.isVisible())await click(s,'#community-close');
  await click(s,'[data-tab=me]');await click(s,'[data-home]');
 }
 if(await s.p.locator('#moment-continue').isVisible())await click(s,'#moment-continue');
 await s.p.locator('[data-room-tab=tea]').first().waitFor();
}
async function tab(s,name){await click(s,`[data-room-tab=${name}]`);}
async function openFeature(s,id){if(!await s.p.locator(id).first().isVisible()&&await s.p.locator('#open-menu').isVisible())await click(s,'#open-menu');await click(s,id);}
async function navigate(s,id){
 if(id==='01')return;
 if(id==='02'){await auth(s,{create:true});await s.p.locator('#account-create').waitFor();await fill(s,'#account-create [name=name]','Unhinged Annotators Society');return;}
 if(id==='03'){await auth(s,{rules:true});return;}
 if(id==='18'){await dismissWelcome(s);await click(s,'[data-tab=near]');const city=s.p.locator('#city');if(await city.count())await city.selectOption({label:'Austin, TX'}).catch(()=>{});return;}
 if(id==='17'){
  await auth(s);await dismissWelcome(s);await click(s,'[data-tab=near]');await click(s,'.verified .club-open');await click(s,'#account-join-club');await s.p.locator('#account-join').waitFor();await fill(s,'#account-join [name=note]','Austen person, will bring cookies.');await submit(s,'#account-join');await s.p.getByText('Fingers crossed.',{exact:true}).waitFor();return;
 }
 await home(s);
 if(id==='04'){await tab(s,'tea');return;}
 if(id==='05'){await tab(s,'tea');await click(s,'#new-take');await fill(s,'#room-take [name=body]','Lizzie reading that letter fourteen times is the most relatable thing in the book');const page=s.p.locator('#room-take [name=page]');if(await page.count())await fill(s,'#room-take [name=page]','288');return;}
 if(id==='06'){await tab(s,'home');return;}
 if(id==='07'){await tab(s,'home');await click(s,'#log-page');return;}
 if(id==='08'){await tab(s,'meet');return;}
 if(id==='09'){await tab(s,'votes');return;}
 if(id==='10'){await tab(s,'home');await openFeature(s,'#rate-book');const take=s.p.locator('#room-rating [name=take], #book-rating [name=take], [data-community=rating] textarea');if(await take.count())await fill(s,'#room-rating [name=take], #book-rating [name=take], [data-community=rating] textarea','Mr. Collins deserves his own spinoff, and I mean that as a threat.');const hearts=s.p.locator('#room-rating [name=hearts][value="4"]');if(await hearts.count())await hearts.check();const asMe=s.p.locator('#room-rating [name=anonymous][value="false"]');if(await asMe.count())await asMe.check();return;}
 if(id==='11'){await openFeature(s,'#our-shelf');return;}
 if(id==='12'){await openFeature(s,'#up-next');return;}
 if(id==='13'){await tab(s,'members');return;}
 if(id==='14'){await openFeature(s,'#club-privacy');return;}
 if(id==='15'){await openFeature(s,'#open-notifications');return;}
 if(id==='16'){await openFeature(s,'#account-settings');return;}
 if(id==='19'){await openFeature(s,'#open-menu');return;}
 throw Error(`No UI navigation for screen ${id}`);
}
async function capture(s,def){
 const ready={'01':'#welcome-find','02':'#account-create','03':'#account-terms','04':'.tea-feed','05':'#room-take','06':'.reading-book','07':'#room-reading','08':'.meeting-card','09':'.room-votes','10':'#room-rating','11':'[data-community=shelf]','12':'[data-community=recommendations]','13':'.member-list','14':'#room-privacy','15':'.notification-list','16':'[data-community=settings]','17':'[data-community=pending]','18':'#city','19':'[data-community=menu]'};
 await s.p.locator(ready[def.id]).first().waitFor();
 await s.p.locator('#toast.visible').waitFor({state:'hidden',timeout:8000});
 await s.p.evaluate(async()=>{await document.fonts.ready;for(const d of document.querySelectorAll('dialog[open]'))d.scrollTop=0;await Promise.all([...document.images].map(async i=>{i.loading='eager';await i.decode().catch(()=>{});}));if(document.activeElement instanceof HTMLElement)document.activeElement.blur();});
 const checks=await s.p.evaluate(v=>{const scope=[...document.querySelectorAll('dialog[open]')].at(-1)||document.body,text=scope.innerText;return{viewportMatches:innerWidth===v.width&&innerHeight===v.height,horizontalOverflow:document.documentElement.scrollWidth>v.width||scope.scrollWidth>scope.clientWidth,brokenImages:[...scope.querySelectorAll('img')].filter(i=>i.complete&&!i.naturalWidth).map(i=>i.getAttribute('src')),emDash:text.includes('\u2014'),visibleText:text,route:location.pathname+location.hash,communityPage:scope.getAttribute('data-community'),dialogOpen:scope.tagName==='DIALOG'};},viewport);
 const built=path.join(out,'built',def.id+'.png');await s.p.screenshot({path:built,animations:'disabled'});
 const reference=path.join(source,def.source),comparison=path.join(out,`${def.id}-${def.name}.png`);
 // Pillow composes only review evidence. It never edits a production asset.
 const py=process.env.PILLOW_PYTHON||'/tmp/bookish-native-art-venv/bin/python';
 execFileSync(py,['-c',"from PIL import Image; import sys; a=Image.open(sys.argv[1]).convert('RGB').resize((390,844),Image.Resampling.LANCZOS); b=Image.open(sys.argv[2]).convert('RGB'); assert b.size==(390,844); out=Image.new('RGB',(780,844)); out.paste(a,(0,0)); out.paste(b,(390,0)); out.save(sys.argv[3])",reference,built,comparison]);
 manifest.captures.push({...def,capturedAt:new Date().toISOString(),url:s.p.url(),steps:s.steps,fixtureCalls:s.api.calls.map(c=>({path:new URL(c.url).pathname,method:c.method,body:c.body})),built:path.relative(out,built),builtSha256:await sha(built),reference:{file:reference,sha256:await sha(reference),sourceDimensions:{width:739,height:1600},comparisonDimensions:viewport},comparison:path.relative(out,comparison),comparisonSha256:await sha(comparison),checks,errors:s.errors,missing:s.missing});
 console.log(`${def.id} ${def.name}: captured`);
}
try{
 for(const def of definitions.filter(d=>requested.has(d.id))){let s;try{s=await launch({member:def.id!=='17'});await navigate(s,def.id);await capture(s,def);}catch(e){manifest.failures.push({id:def.id,name:def.name,error:e.stack});console.error(`${def.id} ${def.name}: ${e.message}`);if(s){await s.p.screenshot({path:path.join(out,'built',def.id+'-failure.png')}).catch(()=>{});await fs.writeFile(path.join(out,'built',def.id+'-failure.html'),await s.p.content());}}finally{if(s)await s.context.close();}}
 manifest.complete=manifest.captures.length===requested.size&&manifest.failures.length===0;
}finally{
 await browser.close();await new Promise(resolve=>server.close(resolve));
 manifest.validation={complete:manifest.complete,requested:[...requested],captured:manifest.captures.map(c=>c.id),failedChecks:manifest.captures.filter(c=>!c.checks.viewportMatches||c.checks.horizontalOverflow||c.checks.brokenImages.length||c.checks.emDash||c.errors.length||c.missing.length).map(c=>c.id),unexpectedExternal:manifest.unexpectedExternal.length};
 const suffix=arg?'-'+[...requested].join('-'):'';
 await fs.writeFile(path.join(out,`manifest${suffix}.json`),JSON.stringify(manifest,null,2)+'\n');
 await fs.writeFile(path.join(out,`README${suffix}.md`),`# Approved v3 app evidence\n\n${manifest.captures.length} actual production app captures in installed Google Chrome, at 390 by 844. The approved reference is on the left, and the actual app is on the right. Capture complete: ${manifest.complete}.\n\nCommit: ${manifest.commit}. Build and fixture hashes, routes, UI actions, network interception, errors, and screenshot hashes are in [the manifest](manifest${suffix}.json).\n\nReproduce after building: \`node app/scripts/capture-v3.mjs\`. Select screens with \`--screens=01,04,19\`, or list indices with \`--list\`. Set \`PLAYWRIGHT_MODULE\` to an installed module and \`PILLOW_PYTHON\` to a Python interpreter with Pillow if needed.\n\n| Screen | Actual app | Approved and actual |\n| --- | --- | --- |\n${manifest.captures.map(c=>`| ${c.id} ${c.name} | [PNG](${c.built}) | [PNG](${c.comparison}) |`).join('\n')}\n\n${manifest.limitations.map(s=>'- '+s).join('\n')}\n`);
 console.log(JSON.stringify(manifest.validation));
 if(!manifest.complete||manifest.validation.failedChecks.length||manifest.unexpectedExternal.length)process.exitCode=1;
}
