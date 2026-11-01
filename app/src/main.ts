import './styles.css';
import { community } from './community.ts';
import { appAsset } from './paths.ts';
import { calendarEvent } from './calendar.ts';
import { data, loadData, refreshData, clearDiscovery } from './data.ts';
import { esc, cityKey, safeURL, clubURL, appleMapsURL, miles, reminderDate } from './domain.ts';
import type { Club, Book, Taste, Reminder } from './domain.ts';
import { rank, picks, why, moods } from './recommend.ts';
import { isNative, readStore, writeStore, locate, shareClub, remoteJSON, Notifications, NativeApp, CityMap } from './native.ts';

type Tab = 'near'|'read'|'saved'|'me';
let mePage:'home'|'resources'='home';
const root = document.querySelector<HTMLDivElement>('#app')!;
let tab:Tab='near', selectedCity='', clubId:string|null=null, view='list', listing='all';
let position:{lat:number;lng:number}|null=null, saved:Record<string,Club>={}, bookSaved:string[]=[], reminders:Record<string,Reminder>={};
let taste:Taste={moods:[],length:null,loved:null}, step=1, showPicks=false, skipPicks=false, query='', clubQuery='', pageSize=40;
let lastDetailTrigger:HTMLElement|null=null, refreshStatus='Your pocket bookshelf, ready wherever you are.';
// U+FE0E forces text presentation; iOS otherwise renders ✳ and ♥ as color emoji.
const symbols = {near:'⌖',read:'▤',saved:'♡\uFE0E',me:'✳\uFE0E'};
const titles:Record<Tab,string> = {near:'Near me',read:'Read next',saved:'Saved',me:'Me'};
const ext = (url:string,label:string) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} <span class="sr-only">(opens outside Bookish)</span></a>`;
const message = (s:string) => { const t=document.querySelector('#toast')!; t.textContent=s; t.classList.add('visible'); setTimeout(()=>t.classList.remove('visible'),5500); };
const persist = async () => { await writeStore('saved',Object.keys(saved)); await writeStore('bookSaved',bookSaved); await writeStore('reminders',reminders); };
const cityGroups = () => {
  const groups=new Map<string,{key:string;name:string;count:number;lat:number;lng:number}>();
  for(const c of data.clubs.filter(c=>community.visible(c.club_id||c.id))) { if(c.lat==null||c.lng==null) continue; const key=cityKey(c), prior=groups.get(key); if(prior) prior.count++; else groups.set(key,{key,name:key,count:1,lat:c.lat,lng:c.lng}); }
  return [...groups.values()].sort((a,b)=>position?miles(position.lat,position.lng,a.lat,a.lng)-miles(position.lat,position.lng,b.lat,b.lng):a.key.localeCompare(b.key));
};
function clubCard(c:Club) {
  const d=position&&c.lat!=null&&c.lng!=null?` · ${Math.round(miles(position.lat,position.lng,c.lat,c.lng))} mi to city center`:'';
  return `<li class="club-card ${c.verified?'verified':''}"><button class="club-open" data-club="${esc(c.id)}"><span class="status">${c.verified?(c.visibility==='open'?'Open':'Private'):'Public calendar'}</span><h3>${esc(c.name)}</h3><p>${esc(cityKey(c))}${d}</p><p>${esc(c.cadence||'Check the listing for the next gathering')}</p></button><button class="save" data-save="${esc(c.id)}" aria-pressed="${!!saved[c.id]}" aria-label="${saved[c.id]?'Unsave':'Save'} ${esc(c.name)}">${saved[c.id]?'♥\uFE0E':'♡\uFE0E'}</button></li>`;
}
function near() {
  const groups=cityGroups(), cityOptions=[...new Set(data.clubs.map(cityKey))].sort();
  let clubs=data.clubs.filter(c=>community.visible(c.club_id||c.id)&&(!selectedCity||cityKey(c)===selectedCity) && (listing==='all'||(listing==='on'?c.verified:!c.verified)) && (!clubQuery||`${c.name} ${c.city} ${c.state} ${c.genres.join(' ')}`.toLowerCase().includes(clubQuery.toLowerCase())));
  if(position&&!selectedCity) clubs=clubs.sort((a,b)=>miles(position!.lat,position!.lng,a.lat??90,a.lng??0)-miles(position!.lat,position!.lng,b.lat??90,b.lng??0));
  return `<header class="intro ${view==='map'?'map-intro':''}"><p class="hello">Good books. Your people.</p><h1>Pull up a chair.</h1><p>Your next chapter starts with a book club.</p><p><button id="redeem-invite" class="invite-entry">Have an invite code?</button></p></header>
  <section class="finder paper ${view==='map'?'map-finder':''}" aria-label="Find clubs">${view==='map'?'<details><summary>Choose a city or genre</summary>':''}<button class="primary" id="locate">${position?'Refresh my location':'Use my location'}</button><p class="small">Your location stays on this device. City centers only.</p><label for="city">Or pick a city</label><select id="city"><option value="">${position?'Closest cities first':'All cities'}</option>${cityOptions.map(key=>`<option ${selectedCity===key?'selected':''}>${esc(key)}</option>`).join('')}</select><label for="club-search">Find a club or genre</label><input id="club-search" type="search" value="${esc(clubQuery)}" placeholder="Mystery, romance, a favorite city…">${view==='map'?'</details>':''}<div class="switch"><button data-view="list" aria-pressed="${view==='list'}">List</button><button data-view="map" aria-pressed="${view==='map'}">Map</button></div></section>
  <div class="list-heading"><h2>${selectedCity?esc(selectedCity):position?'A little closer to you':'Find your people'}</h2><label class="small">Show<select id="listing"><option value="all" ${listing==='all'?'selected':''}>All clubs</option><option value="on" ${listing==='on'?'selected':''}>On Bookish</option><option value="calendar" ${listing==='calendar'?'selected':''}>Public calendars</option></select></label></div>
  ${data.discovery!=='ready'?`<section class="paper network-state" role="status"><h2>${data.discovery==='loading'?'Opening the directory…':'The directory needs a connection.'}</h2><p>${data.discovery==='loading'?'Finding the latest clubs and their city centers.':'We could not load the latest clubs. Your saved books are still here. Reconnect and give the directory another try.'}</p>${data.discovery==='unavailable'?'<button id="refresh" class="primary">Try the directory again</button>':''}</section>`:view==='map'?`<section class="paper"><h2>A whole city of stories</h2><p>City centers only. Meeting places stay inside each club.</p>${isNative?'<button class="primary" id="native-map">Explore the map</button>':''}${browserMap(groups)}<ul class="city-links">${groups.filter(c=>!selectedCity||c.key===selectedCity).slice(0,30).map(c=>`<li><div><b>${esc(c.name)}</b><p>${c.count} clubs</p></div>${ext(appleMapsURL({city:c.name.split(', ')[0],state:c.name.split(', ')[1],lat:c.lat,lng:c.lng}),'Apple Maps')}</li>`).join('')}</ul></section>`:
  `<p class="small">${clubs.length.toLocaleString()} clubs${selectedCity?' in this city':''}. Public-calendar clubs link to their original listing.</p><ul class="clubs">${clubs.slice(0,pageSize).map(clubCard).join('')}</ul>${clubs.length>pageSize?'<button id="more" class="secondary">More clubs</button>':''}${!clubs.length?'<div class="paper"><h2>A fresh page</h2><p>Try another city or refresh the directory. Your next gathering is out there.</p><button id="refresh" class="primary">Refresh directory</button></div>':''}`}`;
}
function browserMap(groups:ReturnType<typeof cityGroups>){
 const points=groups.filter(g=>g.lng>=-126&&g.lng<=-66&&g.lat>=24&&g.lat<=50);
 const x=(lng:number)=>(lng+126)/60*560+20,y=(lat:number)=>(50-lat)/26*290+15;
 return `<div class="city-map"><svg viewBox="0 0 600 330" role="img" aria-label="Book club cities across the United States"><defs><pattern id="map-grid" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M 30 0 L 0 0 0 30" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.12"/></pattern></defs><rect width="600" height="330" rx="12" fill="var(--sage)"/><rect width="600" height="330" fill="url(#map-grid)"/><path d="M43 44 L139 62 L205 67 L276 73 L345 75 L367 48 L390 89 L422 78 L447 94 L467 67 L492 56 L511 31 L539 40 L546 70 L565 81 L538 112 L516 130 L490 170 L465 194 L453 235 L478 278 L472 305 L452 278 L431 236 L396 236 L367 250 L334 246 L310 251 L294 276 L266 268 L239 233 L208 233 L183 228 L161 218 L131 215 L105 186 L83 161 L61 111 L42 76 Z" fill="var(--note)" stroke="var(--ink-2)" stroke-width="1.5"/>${points.map(g=>`<circle cx="${x(g.lng)}" cy="${y(g.lat)}" r="${selectedCity===g.key?8:5}" fill="var(--green)" stroke="var(--note)" stroke-width="2"><title>${esc(g.name)}: ${g.count} clubs</title></circle>`).join('')}<text x="30" y="315" fill="var(--ink-2)" font-size="12">CITY CENTERS ONLY</text></svg><p class="small">Find a city below to explore its readers. Alaska and Hawaii appear in the city list.</p><div class="map-cities">${groups.filter(g=>!selectedCity||g.key===selectedCity).slice(0,12).map(g=>`<button data-map-city="${esc(g.key)}">${esc(g.name)} <span>${g.count}</span></button>`).join('')}</div></div>`;
}
function cover(b:Book) {
  const inside=b.c?`<img src="https://covers.openlibrary.org/b/id/${b.c}-M.jpg?default=false" loading="lazy" alt="Cover of ${esc(b.t)}">`:`<span class="typo-cover">${esc(b.t)}</span>`;
  return b.ol?`<a class="cover" href="https://openlibrary.org/works/${esc(b.ol)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(b.t)} on Open Library">${inside}</a>`:`<span class="cover" role="img" aria-label="${esc(b.t)}">${inside}</span>`;
}
function bookCard(b:Book,line='') { return `<li class="book-card">${cover(b)}<div><h3>${esc(b.t)}</h3><p>${esc(b.a)}${b.p?` · ${b.p} pages`:''}</p>${line?`<p class="why">${esc(line)}</p>`:''}<button class="text-button" data-book-save="${esc(b.id)}" aria-pressed="${bookSaved.includes(b.id)}">${bookSaved.includes(b.id)?'♥\uFE0E Saved':'♡\uFE0E Save book'}</button></div></li>`; }
function read() {
  if(showPicks) {
    const t=skipPicks?{moods:[],length:null,loved:null}:taste, ranked=rank(data.books,data.community,t), top=skipPicks?[]:picks(data.books,t,ranked), by=new Map(data.books.map(b=>[b.id,b]));
    const city=selectedCity.split(', '), stats=data.community.city.filter(r=>r.city===city[0]&&r.state===city[1]);
    const community=stats.length?stats:data.community.national;
    return `<header class="intro"><p class="hello">One more chapter?</p><h1>Read next</h1><p>${skipPicks?'Book-club staples, ready for your shelf.':'A few books we’d pull off the shelf for you.'}</p><button id="redo" class="light-button">Change my three taps</button></header>${top.length?`<section class="paper"><h2>Three to fall into</h2><ul class="books">${top.map(r=>bookCard(r.b,`${r.slot}. ${why(r,t)}`)).join('')}</ul></section>`:''}
    ${community.length?`<section class="paper"><h2>${stats.length?`Clubs in ${esc(city[0])} loved`:'Clubs on Bookish loved'}</h2><ul class="books">${community.filter(r=>by.has(r.book_id)).slice(0,8).map(r=>bookCard(by.get(r.book_id)!,`${r.clubs} clubs read this`)).join('')}</ul></section>`:''}
    ${(t.moods.length?t.moods:['short','mystery','cry']).slice(0,3).map(m=>`<section class="paper"><h2>${esc(moods[m])}</h2><ul class="books">${ranked.filter(r=>r.b.m.includes(m)&&!top.some(p=>p.b.id===r.b.id)).slice(0,6).map(r=>bookCard(r.b)).join('')}</ul></section>`).join('')}<p class="small">Book covers and book details from ${ext('https://openlibrary.org/','Open Library')}. Tap a cover to visit the book.</p>`;
  }
  const heading=['','What are you in the mood for?','Weekend read or a doorstop?','One book you loved?'][step];
  return `<header class="intro"><p class="hello">A book for your kind of night.</p><h1>Read next</h1><p>Three taps. A new favorite.</p></header><section class="paper"><p class="progress">${step} of 3</p><h2>${heading}</h2>${step===1?`<div class="options">${Object.entries(moods).map(([k,v])=>`<button data-mood="${k}" aria-pressed="${taste.moods.includes(k)}">${v}</button>`).join('')}</div>`:step===2?`<div class="options">${Object.entries({short:'Under 300 pages',mid:'300–450 pages',long:'A long, lovely read',any:'Any length'}).map(([k,v])=>`<button data-length="${k}" aria-pressed="${taste.length===k}">${v}</button>`).join('')}</div>`:`<label for="book-search">Title or author</label><input type="search" id="book-search" value="${esc(query)}" placeholder="A book you keep thinking about…"><div id="book-hits">${bookHits()}</div>`}<button class="primary" id="next">${step===3?'Find my next read':'Next'}</button>${step>1?'<button class="text-button" id="back-step">Back</button>':''}<button class="text-button" id="skip">${step===3?'Skip this book':'Browse the bookshelf'}</button></section>`;
}
function bookHits() { const selected=data.books.find(b=>b.id===taste.loved); return `${selected?`<p class="chosen">Your pick: ${esc(selected.t)} <button class="text-button" id="clear-loved">Change</button></p>`:''}${query.length>1?`<ul class="search-hits">${data.books.filter(b=>`${b.t} ${b.a}`.toLowerCase().includes(query.toLowerCase())).slice(0,8).map(b=>`<li><button data-loved="${esc(b.id)}">${esc(b.t)}<small>${esc(b.a)}</small></button></li>`).join('')||'<li>Try another favorite, or skip this book.</li>'}</ul>`:''}`; }
function visibleSavedClubs(){return Object.values(saved).flatMap(c=>{const live=data.clubs.find(x=>x.id===c.id);return live&&community.visible(live.club_id||live.id)?[live]:[];});}
function savedView() { return `<header class="intro"><p class="hello">Keep the good ones close.</p><h1>Your little collection.</h1><p>Saved on this device, ready for your next chapter.</p></header><h2>Clubs to come back to</h2><ul class="clubs">${visibleSavedClubs().map(clubCard).join('')}</ul>${!visibleSavedClubs().length?'<section class="paper"><p>Tap a heart on a club to keep it here. Add a meeting reminder when your host shares the date.</p><button class="primary" data-tab="near">Find my people</button></section>':''}<section class="paper"><h2>Meeting reminders</h2>${Object.entries(reminders).filter(([id,r])=>new Date(r.meeting)>new Date()&&community.visible(saved[id]?.club_id||id)).map(([id,r])=>`<div class="reminder"><b>${esc(saved[id]?.name||'Book club')}</b><p>${new Date(r.meeting).toLocaleString()} · ${r.minutes===1440?'A day before':r.minutes===60?'An hour before':'At meeting time'}</p><button class="text-button" data-cancel="${esc(id)}">Remove reminder</button></div>`).join('')||'<p>A date on the calendar makes the next chapter sweeter. Open a saved club to add one.</p>'}</section><section class="paper"><h2>Books for later</h2><ul class="books">${data.books.filter(b=>bookSaved.includes(b.id)).map(b=>bookCard(b)).join('')}</ul>${!bookSaved.length?'<p>Save a book from Read next to start your shelf.</p>':''}</section>`; }
function me() { return `<header class="intro"><p class="hello">A seat for every reader.</p><h1>Your reading room.</h1><p>Find a club. Find your people. Make a night of it.</p></header>${community.accountView()}<section class="paper"><h2>Resources</h2><p>A little help for your next gathering: discussion guides, hosting tips, and printables.</p><button id="open-resources" class="secondary">Explore Resources</button></section><section class="paper"><h2>Your pocket reading room</h2><p>Explore book clubs across the US, save a few favorites, and bring a new book to the table.</p><p>City centers keep the map friendly and private. Hosts share the meeting place and time with their members. Public-calendar listings link you to the original source.</p></section><section class="paper"><h2>Made for your device</h2><p>Your saved clubs, books, taste, and reminders stay here. Location is used on this device to sort cities. Bookish refreshes its directory when you open the app.</p><p>Your email signs you in. Your profile, memberships, join notes, and anonymous votes are stored by Bookish. Meeting details are shared only with members. Covers load from Open Library as normal image requests.</p><p>${esc(refreshStatus)}</p><button id="refresh" class="secondary">Refresh directory</button></section><section class="paper links"><h2>The useful bits</h2>${ext('https://meetbookish.com/privacy/','Privacy')}${ext('https://meetbookish.com/terms/','Terms')}${ext('https://meetbookish.com/about/','About our sources')}<a href="mailto:hello@meetbookish.com">Say hello</a></section><section class="paper"><h2>With a little library love</h2><p>Book covers and book details from ${ext('https://openlibrary.org/','Open Library')}, an Internet Archive initiative. Covers are identification thumbnails; tap one to visit the book.</p><p class="small">Bookish 1.1 · A fresh chapter.</p></section>`; }
function resources() { return `<header class="intro"><button id="back-to-me" class="light-button">Back to Me</button><p class="hello">For a lovely gathering.</p><h1>Resources</h1><p>Good company, a good book, and a little inspiration.</p></header><section class="paper links" aria-label="Reading and hosting resources">${ext('https://meetbookish.com/resources/','Discussion guides and reading resources')}${ext('https://meetbookish.com/resources/hosting-tips/','Hosting tips')}${ext('https://meetbookish.com/resources/pairings/','Snacks and drink pairings')}${ext('https://meetbookish.com/resources/printables/','Printable bookmarks and RSVP cards')}<p class="small">These resources open in your browser.</p></section>`; }
function render() {
  const scroll=window.scrollY;
  root.innerHTML=`<div class="app-shell"><div class="mast"><img src="${appAsset('img/wordmark-320.webp')}" width="144" height="68" alt="Bookish"><span>A book club kind of night.</span></div><main id="main" tabindex="-1">${tab==='near'?near():tab==='read'?read():tab==='saved'?savedView():mePage==='resources'?resources():me()}</main><nav class="tabs" aria-label="Main navigation">${(Object.keys(titles) as Tab[]).map(t=>`<button data-tab="${t}" ${tab===t?'aria-current="page"':''}><span aria-hidden="true">${symbols[t]}</span>${titles[t]}</button>`).join('')}</nav></div><dialog id="detail" aria-labelledby="detail-title"></dialog>`;
  window.scrollTo(0,scroll);
  if(clubId) renderDetail();
  community.rendered();
}
function currentClub() { return data.clubs.find(c=>c.id===clubId&&community.visible(c.club_id||c.id))||null; }
function renderDetail() {
  const c=currentClub(); if(!c) {clubId=null;document.querySelector<HTMLDialogElement>('#detail')?.close();return;}
  const d=document.querySelector<HTMLDialogElement>('#detail')!;
  d.innerHTML=`<div class="detail-head"><button id="close-detail" class="text-button">Close</button><button id="share" class="text-button">Share club</button></div><p class="status">${c.verified?'On Bookish':'From a public calendar'}</p><h1 id="detail-title">${esc(c.name)}</h1><p>${esc(cityKey(c))}</p><div class="detail-info"><p>${esc(c.vibe||'A good book and a table full of readers.')}</p><p>${esc(c.cadence||'Check with the host for the next gathering.')}${c.current_book?` · Reading ${esc(c.current_book.title)}`:''}</p><p>${esc(c.genres.join(', '))}${c.format?` · ${esc(c.format)}`:''}</p>${c.source_name?`<p>Listed by ${esc(c.source_name)}</p>`:''}${c.last_seen?`<p class="small">Listing checked ${esc(c.last_seen)}</p>`:''}<p>Meeting places are shared by the host. The map shows the city center.</p>${ext(appleMapsURL(c),'See city in Apple Maps')}${safeURL(c.source_url)?`<p>${ext(c.source_url!,'Visit the original listing')}</p>`:''}</div><button class="secondary" data-save="${esc(c.id)}" aria-pressed="${!!saved[c.id]}">${saved[c.id]?'♥\uFE0E Saved on this device':'♡\uFE0E Save this club'}</button>
  ${c.verified?`<section class="join-section"><h2>${c.visibility==='open'?'A chair is waiting.':'Your people might be here.'}</h2><p>${c.visibility==='open'?'Join this Open club and step into the reading room.':'Private clubs welcome readers after the host approves a request.'}</p><button class="primary" id="account-join-club">${community.signedIn?(c.visibility==='open'?'Join club':'Request to join'):'Sign in to join'}</button><button class="text-button" data-content="${esc(c.club_id||c.id)}" data-kind="club" data-label="${esc(c.name)}">Report or block this club</button></section>`:`<section><h2>A public-calendar gathering</h2><p>Visit the original listing for the current book, meeting date, and how to take part.</p>${ext(`https://meetbookish.com/claim/?club_id=${encodeURIComponent(c.id)}&club_name=${encodeURIComponent(c.name)}&club_city=${encodeURIComponent(c.city)}`,'Host this club? Claim it')}</section>`}
  <section class="reminder-section"><h2>Make a date of it</h2><p>Got a date from your host or the listing? Save it here. Times use your device’s time zone.</p>${reminders[c.id]?`<p class="chosen">Meeting: ${new Date(reminders[c.id].meeting).toLocaleString()}</p><button class="text-button" data-cancel="${esc(c.id)}">Remove reminder</button>`:''}<form id="remind"><label>Next meeting<input type="datetime-local" name="meeting" required></label><label>Remind me<select name="minutes"><option value="60">An hour before</option><option value="1440">A day before</option><option value="0">At meeting time</option></select></label><button type="submit" class="primary">${isNative?'Save meeting reminder':'Download calendar reminder'}</button><p class="small">${isNative?'We’ll ask to send a local notification when you save.':'Download a calendar file with your meeting and reminder.'}</p><p class="form-message" role="status"></p></form></section>`;
  if(!d.open) d.showModal();
  d.oncancel=()=>{clubId=null;};
}
async function changeTab(t:Tab) { tab=t;mePage='home';clubId=null;render();window.scrollTo(0,0);document.querySelector<HTMLElement>('#main')?.focus({preventScroll:true}); }
async function cancelReminder(id:string) { const r=reminders[id]; if(!r)return; if(isNative) await Notifications.cancel({notifications:[{id:r.id}]}); delete reminders[id]; await persist(); render(); message('Reminder removed. Your club is still saved.'); }
root.addEventListener('input',e=>{const el=e.target as HTMLInputElement;if(el.id==='book-search'){query=el.value;document.querySelector('#book-hits')!.innerHTML=bookHits();}});
root.addEventListener('change',async e=>{const el=e.target as HTMLInputElement;if(el.id==='city'){selectedCity=el.value;pageSize=40;await writeStore('city',selectedCity);render();}if(el.id==='listing'){listing=el.value;pageSize=40;render();}if(el.id==='club-search'){clubQuery=el.value;pageSize=40;render();}});
root.addEventListener('click',async e=>{
  const b=(e.target as HTMLElement).closest<HTMLElement>('button');if(!b)return;
  try {
    if(community.handles(b)){await community.click(b);return;}
    if(b.id==='account-join-club'){if(currentClub())await community.join(currentClub()!.id);return;}
    if(b.dataset.mapCity){selectedCity=b.dataset.mapCity;view='list';render();return;}
    if(b.id==='open-resources'||b.id==='back-to-me'){mePage=b.id==='open-resources'?'resources':'home';render();window.scrollTo(0,0);document.querySelector<HTMLElement>('#main')?.focus({preventScroll:true});return;}
    if(b.dataset.tab) {await changeTab(b.dataset.tab as Tab);return;}
    if(b.dataset.club){lastDetailTrigger=b;clubId=b.dataset.club;renderDetail();return;}
        if(b.id==='keep-browsing'){document.querySelector<HTMLDialogElement>('#detail')!.close();clubId=null;if(tab!=='near')await changeTab('near');else lastDetailTrigger?.focus();return;}
    if(b.id==='close-detail'){document.querySelector<HTMLDialogElement>('#detail')!.close();clubId=null;lastDetailTrigger?.focus();return;}
    if(b.dataset.save){const id=b.dataset.save,c=data.clubs.find(c=>c.id===id)||saved[id];if(!c)return;if(saved[id]){if(reminders[id])await cancelReminder(id);delete saved[id];}else saved[id]=c;await persist();render();return;}
    if(b.dataset.bookSave){const id=b.dataset.bookSave;bookSaved=bookSaved.includes(id)?bookSaved.filter(x=>x!==id):[...bookSaved,id];await persist();render();return;}
    if(b.dataset.cancel){await cancelReminder(b.dataset.cancel);return;}
    if(b.dataset.view){view=b.dataset.view;render();if(view==='map'&&isNative)await openMap();return;}
    if(b.id==='native-map'){await openMap();return;}
    if(b.id==='locate'){b.setAttribute('disabled','');b.textContent='Finding nearby cities…';try{position=await locate();selectedCity='';await writeStore('city','');render();message('Your location is ready. Let’s find your people.');}finally{b.removeAttribute('disabled');b.textContent='Use my location';}return;}
    if(b.id==='more'){pageSize+=40;render();return;}
    if(b.dataset.mood){const m=b.dataset.mood;taste.moods=taste.moods.includes(m)?taste.moods.filter(x=>x!==m):[...taste.moods,m];render();return;}
    if(b.dataset.length){taste.length=b.dataset.length;render();return;}
    if(b.dataset.loved){taste.loved=b.dataset.loved;query='';render();return;}
    if(b.id==='clear-loved'){taste.loved=null;render();return;}
    if(b.id==='back-step'){step--;render();return;}
    if(b.id==='next'||b.id==='skip'){if(b.id==='skip'&&step<3){skipPicks=true;showPicks=true;}else if(step<3){step++;}else{if(b.id==='skip')taste.loved=null;showPicks=true;skipPicks=false;await writeStore('taste',taste);}render();window.scrollTo(0,0);return;}
    if(b.id==='redo'){showPicks=false;step=1;render();return;}
    if(b.id==='share'){const c=currentClub();if(c){const result=await shareClub(c.name,clubURL(c));if(result)message(result);}return;}
    if(b.id==='refresh'){b.setAttribute('disabled','');await refresh();render();message(refreshStatus);return;}
  } catch(err){community.recoverAuth();if((err as Error).name!=='AbortError')message((err as Error).message||'Give that another try in a moment.');}
});
root.addEventListener('submit',async e=>{
  e.preventDefault();const form=e.target as HTMLFormElement;if(await community.submit(form))return;const c=currentClub();if(!c||!form.reportValidity())return;
  const values=new FormData(form), button=form.querySelector<HTMLButtonElement>('button[type="submit"]')!, status=form.querySelector<HTMLElement>('.form-message')!;
  button.disabled=true;status.textContent='';
  try {
    if(form.id==='remind'){
      const meeting=String(values.get('meeting')),minutes=Number(values.get('minutes')),at=reminderDate(meeting,minutes);
      if(!isNative){
        const content=calendarEvent(c.name,meeting,minutes);
        const url=URL.createObjectURL(new Blob([content],{type:'text/calendar;charset=utf-8'}));
        const link=document.createElement('a');link.href=url;link.download='bookish-meeting.ics';link.click();
        setTimeout(()=>URL.revokeObjectURL(url),1000);
        saved[c.id]=c;await persist();
        status.textContent='Calendar file ready. Open it in your calendar to add the meeting and reminder.';
        return;
      }
      if((await Notifications.requestPermissions()).display!=='granted')throw new Error('Enable Bookish notifications in Settings, then save your reminder here.');
      const pending=await Notifications.getPending();if(pending.notifications.length>=60&&!reminders[c.id])throw new Error('Your calendar is wonderfully full. Remove a reminder to make room for this one.');
      const id=reminders[c.id]?.id||(await readStore('reminderSeq',1000))+1;
      await Notifications.schedule({notifications:[{id,title:`A book club kind of day`,body:`${c.name}${minutes?' is coming up.':' meets now.'} Bring your book and your best theory.`,schedule:{at},extra:{clubId:c.id}}]});
      saved[c.id]=c;reminders[c.id]={id,meeting:new Date(meeting).toISOString(),minutes,at:at.toISOString()};await writeStore('reminderSeq',id);await persist();render();message('A date for your diary. We’ll give you a nudge.');
    }
  } catch(err) {status.textContent=(err as Error).message||'Check your connection and try once more.';} finally{if(form.dataset.sent!=='true')button.disabled=false;}
});
root.addEventListener('error',e=>{const img=e.target as HTMLImageElement;if(img.tagName==='IMG'&&img.closest('.cover')){const s=document.createElement('span');s.className='typo-cover';s.textContent=img.alt.replace(/^Cover of /,'');img.replaceWith(s);}},true);
root.addEventListener('load',e=>{const img=e.target as HTMLImageElement;if(img.tagName==='IMG'&&img.closest('.cover')&&img.naturalWidth<10)img.dispatchEvent(new Event('error'));},true);
async function openMap(){const result=await CityMap.present({cities:cityGroups(),selected:selectedCity||undefined});if(result.cityKey){selectedCity=result.cityKey;view='list';pageSize=40;await writeStore('city',selectedCity);render();}}
async function refresh(){
 clearDiscovery();saved={};clubId=null;render();
 const prior=await readStore<unknown>('saved',[]);
 const ids=Array.isArray(prior)?prior:prior&&typeof prior==='object'?Object.keys(prior):[];
 const ok=await refreshData();saved=Object.fromEntries(data.clubs.filter(c=>ids.includes(c.id)).map(c=>[c.id,c]));
 await writeStore('saved',Object.keys(saved));
 refreshStatus=ok?'Fresh from the shelves. Directory updated just now.':'Club discovery needs a connection. Your books are still here.';
 render();
}
community.init(render,message);
async function start(){
  root.innerHTML=`<main class="loading"><img src="${appAsset('img/wordmark-320.webp')}" alt="Bookish" width="180"><p>Opening your reading room…</p></main>`;
  await loadData();
  const prior=await readStore<unknown>('saved',[]);
  const ids=Array.isArray(prior)?prior:prior&&typeof prior==='object'?Object.keys(prior):[];
  saved=Object.fromEntries(data.clubs.filter(c=>ids.includes(c.id)).map(c=>[c.id,c]));
  await writeStore('saved',Object.keys(saved));
  [bookSaved,reminders,taste,selectedCity]=await Promise.all([readStore('bookSaved',[]),readStore('reminders',{}),readStore('taste',taste),readStore('city','')]);
  render();
  if(isNative){await Notifications.addListener('localNotificationActionPerformed',event=>{const id=event.notification.extra?.clubId;if(id&&(saved[id]||data.clubs.some(c=>c.id===id))){tab='saved';clubId=id;render();}});await NativeApp.addListener('resume',()=>{void refresh();});}
  window.addEventListener('focus',()=>{void refresh();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clearDiscovery();saved={};clubId=null;render();}else void refresh();});
}
void start().catch(()=>{root.innerHTML='<main class="loading"><h1>A fresh page awaits.</h1><p>Close and reopen Bookish to reload your bookshelf.</p></main>';});
