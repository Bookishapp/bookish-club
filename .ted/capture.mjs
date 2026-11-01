import {chromium} from '/tmp/bookish-browser/node_modules/playwright/index.mjs';
import {createFixtureAPI} from '../app/tests/fixtures.mjs';
import fs from 'node:fs/promises';
const out=new URL('./capture/',import.meta.url);await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const frames=[],errors=[];
async function start(options){const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,reducedMotion:'reduce'});const api=createFixtureAPI(options);await context.route('**/*.supabase.co/**',async route=>{const r=route.request();let body={};try{body=r.postDataJSON()||{};}catch{}try{await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(await api.respond(r.url(),body,r.method()))});}catch(e){errors.push(e.message);await route.abort();}});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:4331/');await page.locator('.club-open').first().waitFor();return {page,context,api};}
async function shot(page,name){await page.locator('#toast.visible').waitFor({state:'hidden',timeout:7000});await page.locator('img').evaluateAll(async imgs=>{await Promise.all(imgs.map(img=>img.decode().catch(()=>{})));});await page.evaluate(()=>{const d=document.querySelector('dialog[open]');if(d)d.scrollTop=0;});await page.screenshot({path:new URL(name+'.png',out).pathname});const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));if(size.scroll>size.width)throw Error(name+' horizontal overflow '+JSON.stringify(size));frames.push(name);}
async function signIn(page){await page.locator('#account-email [name=email]').fill('alex@example.test');await page.locator('#account-email button[type=submit]').click();await page.locator('#account-code [name=token]').fill('123456');await page.locator('#account-code button[type=submit]').click();await page.locator('#account-terms [name=display_name]').fill('Alex');await page.locator('#account-terms [name=adult]').check();await page.locator('#account-terms [name=terms]').check();await page.locator('#account-terms button[type=submit]').click();await page.locator('#account-terms').waitFor({state:'detached'});}
try{
 const guest=await start({role:'member',member:false}),p=guest.page;
 await p.locator('[data-view=map]').click();await shot(p,'01-guest-map');
 await p.locator('[data-view=list]').click();await p.locator('.club-open').first().click();await shot(p,'02-club-page');
 await p.locator('#account-join-club').click();await shot(p,'03-sign-up');
 await signIn(p);await p.locator('#account-join').waitFor();await shot(p,'04-request-to-join');
 await p.locator('#account-join [name=note]').fill('I love a good mystery and a lively discussion.');await p.locator('#account-join button[type=submit]').click();await p.getByText('Fingers crossed.',{exact:true}).waitFor();await shot(p,'05-request-sent');
 await guest.context.close();
 const host=await start({role:'host',member:true}),h=host.page;
 await h.locator('[data-tab=me]').click();await h.locator('#sign-in').click();await signIn(h);await h.locator('[data-home]').first().waitFor();await shot(h,'06-me');
 await h.locator('[data-home]').first().click();await h.locator('[data-room-tab=home]').click();await shot(h,'07-club-home');
 await h.locator('[data-room-tab=manage]').click();await h.locator('[data-decide]').first().waitFor();await shot(h,'08-host-approval');
 await h.locator('[data-decide][data-approve=true]').first().click();await h.getByText('All caught up. New requests will appear here.',{exact:true}).waitFor();
 await h.locator('[data-room-tab=votes]').click();await shot(h,'09-votes');
 await h.locator('[data-ballot]').first().click();await h.locator('[data-ballot][aria-pressed=true]').waitFor();
 await h.locator('#community-close').click();await h.locator('#account-settings').click();await h.locator('#delete-account').click();await shot(h,'10-delete-account');
 await h.locator('#account-delete [name=confirm]').fill('DELETE');await h.locator('#account-delete button[type=submit]').click();await h.locator('#sign-in').waitFor();
 await fs.writeFile(new URL('./CAPTURE.json',import.meta.url),JSON.stringify({browser:'Google Chrome',viewport:{width:390,height:844},source:'local Vite build; all Supabase requests intercepted by app/tests/fixtures.mjs; no production writes',frames,errors},null,2)+'\n');
 if(errors.length)throw Error(errors.join('\n'));console.log('Captured '+frames.length+' frames in Chrome; signup, private join, host approval, ballot, and deletion exercised with local fixtures.');
}finally{await browser.close();}
