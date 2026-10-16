import './styles.css';
import { data, loadData, refreshData } from './data.ts';
import { esc, cityKey, safeURL, clubURL, appleMapsURL, miles, reminderDate } from './domain.ts';
import type { Club, Book, Taste, Reminder } from './domain.ts';
import { rank, picks, why, moods } from './recommend.ts';
import { isNative, readStore, writeStore, locate, shareClub, remoteJSON, Notifications, NativeApp, CityMap } from './native.ts';

type Tab = 'near'|'read'|'saved'|'about';
const root = document.querySelector<HTMLDivElement>('#app')!;
let tab:Tab='near', selectedCity='', clubId:string|null=null, view='list', listing='all';
let position:{lat:number;lng:number}|null=null, saved:Record<string,Club>={}, bookSaved:string[]=[], reminders:Record<string,Reminder>={};
let taste:Taste={moods:[],length:null,loved:null}, step=1, showPicks=false, skipPicks=false, query='', clubQuery='', pageSize=40;
let joinStarted=0, lastDetailTrigger:HTMLElement|null=null, refreshStatus='Your pocket bookshelf, ready wherever you are.';
const symbols = {near:'⌖',read:'▤',saved:'♡',about:'✳'};
const titles:Record<Tab,string> = {near:'Near me',read:'Read next',saved:'Saved',about:'About'};
const ext = (url:string,label:string) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} <span class="sr-only">(opens outside Bookish)</span></a>`;
const message = (s:string) => { const t=document.querySelector('#toast')!; t.textContent=s; t.classList.add('visible'); setTimeout(()=>t.classList.remove('visible'),5500); };
const persist = async () => { await writeStore('saved',saved); await writeStore('bookSaved',bookSaved); await writeStore('reminders',reminders); };
const cityGroups = () => {
  const groups=new Map<string,{key:string;name:string;count:number;lat:number;lng:number}>();
  for(const c of data.clubs) { if(c.lat==null||c.lng==null) continue; const key=cityKey(c), prior=groups.get(key); if(prior) prior.count++; else groups.set(key,{key,name:key,count:1,lat:c.lat,lng:c.lng}); }
  return [...groups.values()].sort((a,b)=>position?miles(position.lat,position.lng,a.lat,a.lng)-miles(position.lat,position.lng,b.lat,b.lng):a.key.localeCompare(b.key));
};
function clubCard(c:Club) {
  const d=position&&c.lat!=null&&c.lng!=null?` · ${Math.round(miles(position.lat,position.lng,c.lat,c.lng))} mi to city center`:'';
  return `<li class="club-card ${c.verified?'verified':''}"><button class="club-open" data-club="${esc(c.id)}"><span class="status">${c.verified?'On Bookish':'Public calendar'}</span><h3>${esc(c.name)}</h3><p>${esc(cityKey(c))}${d}</p><p>${esc(c.cadence||'Check the listing for the next gathering')}</p></button><button class="save" data-save="${esc(c.id)}" aria-pressed="${!!saved[c.id]}" aria-label="${saved[c.id]?'Unsave':'Save'} ${esc(c.name)}">${saved[c.id]?'♥':'♡'}</button></li>`;
}
function near() {
  const groups=cityGroups(), cityOptions=[...new Set(data.clubs.map(cityKey))].sort();
  let clubs=data.clubs.filter(c=>(!selectedCity||cityKey(c)===selectedCity) && (listing==='all'||(listing==='on'?c.verified:!c.verified)) && (!clubQuery||`${c.name} ${c.city} ${c.state} ${c.genres.join(' ')}`.toLowerCase().includes(clubQuery.toLowerCase())));
  if(position&&!selectedCity) clubs=clubs.sort((a,b)=>miles(position!.lat,position!.lng,a.lat??90,a.lng??0)-miles(position!.lat,position!.lng,b.lat??90,b.lng??0));
  return `<header class="intro"><p class="hello">Good books. Your people.</p><h1>Pull up a chair.</h1><p>Your next chapter starts with a book club.</p></header>
  <section class="finder paper" aria-label="Find clubs"><button class="primary" id="locate">${position?'Refresh my location':'Use my location'}</button><p class="small">Your location stays on this device. City centers only.</p><label for="city">Or pick a city</label><select id="city"><option value="">${position?'Closest cities first':'All cities'}</option>${cityOptions.map(key=>`<option ${selectedCity===key?'selected':''}>${esc(key)}</option>`).join('')}</select><label for="club-search">Find a club or genre</label><input id="club-search" type="search" value="${esc(clubQuery)}" placeholder="Mystery, romance, a favorite city…"><div class="switch"><button data-view="list" aria-pressed="${view==='list'}">List</button><button data-view="map" aria-pressed="${view==='map'}">Map</button></div></section>
  <div class="list-heading"><h2>${selectedCity?esc(selectedCity):position?'A little closer to you':'Find your people'}</h2><label class="small">Show<select id="listing"><option value="all" ${listing==='all'?'selected':''}>All clubs</option><option value="on" ${listing==='on'?'selected':''}>On Bookish</option><option value="calendar" ${listing==='calendar'?'selected':''}>Public calendars</option></select></label></div>
  ${view==='map'?`<section class="paper"><h2>A whole city of stories</h2><p>Explore cities on Apple Maps. Pins show city centers; hosts share meeting places with members.</p>${isNative?'<button class="primary" id="native-map">Explore the map</button>':''}<ul class="city-links">${groups.filter(c=>!selectedCity||c.key===selectedCity).slice(0,30).map(c=>`<li><div><b>${esc(c.name)}</b><p>${c.count} clubs</p></div>${ext(appleMapsURL({city:c.name.split(', ')[0],state:c.name.split(', ')[1],lat:c.lat,lng:c.lng}),'Apple Maps')}</li>`).join('')}</ul></section>`:
  `<p class="small">${clubs.length.toLocaleString()} clubs${selectedCity?' in this city':''}. Public-calendar clubs link to their original listing.</p><ul class="clubs">${clubs.slice(0,pageSize).map(clubCard).join('')}</ul>${clubs.length>pageSize?'<button id="more" class="secondary">More clubs</button>':''}${!clubs.length?'<div class="paper"><h2>A fresh page</h2><p>Try another city or choose all clubs. Your next gathering is out there.</p></div>':''}`}`;
}
function cover(b:Book) {
  const inside=b.c?`<img src="https://covers.openlibrary.org/b/id/${b.c}-M.jpg?default=false" loading="lazy" alt="Cover of ${esc(b.t)}">`:`<span class="typo-cover">${esc(b.t)}</span>`;
  return b.ol?`<a class="cover" href="https://openlibrary.org/works/${esc(b.ol)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(b.t)} on Open Library">${inside}</a>`:`<span class="cover" role="img" aria-label="${esc(b.t)}">${inside}</span>`;
}
function bookCard(b:Book,line='') { return `<li class="book-card">${cover(b)}<div><h3>${esc(b.t)}</h3><p>${esc(b.a)}${b.p?` · ${b.p} pages`:''}</p>${line?`<p class="why">${esc(line)}</p>`:''}<button class="text-button" data-book-save="${esc(b.id)}" aria-pressed="${bookSaved.includes(b.id)}">${bookSaved.includes(b.id)?'♥ Saved':'♡ Save book'}</button></div></li>`; }
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
function savedView() { return `<header class="intro"><p class="hello">Keep the good ones close.</p><h1>Your little collection.</h1><p>Saved on this device, ready for your next chapter.</p></header><h2>Clubs to come back to</h2><ul class="clubs">${Object.values(saved).map(c=>clubCard(data.clubs.find(x=>x.id===c.id)||{...c,verified:false})).join('')}</ul>${!Object.keys(saved).length?'<section class="paper"><p>Tap a heart on a club to keep it here. Add a meeting reminder when your host shares the date.</p><button class="primary" data-tab="near">Find my people</button></section>':''}<section class="paper"><h2>Meeting reminders</h2>${Object.entries(reminders).filter(([,r])=>new Date(r.meeting)>new Date()).map(([id,r])=>`<div class="reminder"><b>${esc(saved[id]?.name||'Book club')}</b><p>${new Date(r.meeting).toLocaleString()} · ${r.minutes===1440?'A day before':r.minutes===60?'An hour before':'At meeting time'}</p><button class="text-button" data-cancel="${esc(id)}">Remove reminder</button></div>`).join('')||'<p>A date on the calendar makes the next chapter sweeter. Open a saved club to add one.</p>'}</section><section class="paper"><h2>Books for later</h2><ul class="books">${data.books.filter(b=>bookSaved.includes(b.id)).map(b=>bookCard(b)).join('')}</ul>${!bookSaved.length?'<p>Save a book from Read next to start your shelf.</p>':''}</section>`; }
function about() { return `<header class="intro"><p class="hello">A seat for every reader.</p><h1>Hi, we’re Bookish.</h1><p>Find a club. Find your people. Make a night of it.</p></header><section class="paper"><h2>Your pocket reading room</h2><p>Explore book clubs across the US, save a few favorites, and bring a new book to the table.</p><p>City centers keep the map friendly and private. Hosts share the meeting place and time with their members. Public-calendar listings link you to the original source.</p></section><section class="paper"><h2>Made for your device</h2><p>Your saved clubs, books, taste and reminders stay here. Location is used on this device to sort cities. Bookish refreshes its directory when you open the app.</p><p>When you send a join request, your email and note go to Bookish so the host can reply. Covers load from Open Library as normal image requests.</p><p>${esc(refreshStatus)}</p><button id="refresh" class="secondary">Refresh directory</button></section><section class="paper links"><h2>The useful bits</h2>${ext('https://meetbookish.com/privacy/','Privacy')}${ext('https://meetbookish.com/terms/','Terms')}${ext('https://meetbookish.com/about/','About our sources')}<a href="mailto:hello@meetbookish.com">Say hello</a></section><section class="paper"><h2>With a little library love</h2><p>Book covers and book details from ${ext('https://openlibrary.org/','Open Library')}, an Internet Archive initiative. Covers are identification thumbnails; tap one to visit the book.</p><p class="small">Bookish 0.1 · A fresh chapter.</p></section>`; }
function render() {
  const scroll=window.scrollY;
  root.innerHTML=`<div class="app-shell"><div class="mast"><img src="/img/wordmark-320.webp" width="144" height="68" alt="Bookish"><span>A book club kind of night.</span></div><main id="main" tabindex="-1">${tab==='near'?near():tab==='read'?read():tab==='saved'?savedView():about()}</main><nav class="tabs" aria-label="Main navigation">${(Object.keys(titles) as Tab[]).map(t=>`<button data-tab="${t}" ${tab===t?'aria-current="page"':''}><span aria-hidden="true">${symbols[t]}</span>${titles[t]}</button>`).join('')}</nav></div><dialog id="detail" aria-labelledby="detail-title"></dialog>`;
  window.scrollTo(0,scroll);
  if(clubId) renderDetail();
}
function currentClub() { return data.clubs.find(c=>c.id===clubId)||(clubId&&saved[clubId]?{...saved[clubId],verified:false}:null); }
function renderDetail() {
  const c=currentClub(); if(!c) {clubId=null;return;}
  const d=document.querySelector<HTMLDialogElement>('#detail')!;
  d.innerHTML=`<div class="detail-head"><button id="close-detail" class="text-button">Close</button><button id="share" class="text-button">Share club</button></div><p class="status">${c.verified?'On Bookish':'From a public calendar'}</p><h1 id="detail-title">${esc(c.name)}</h1><p>${esc(cityKey(c))}</p><div class="detail-info"><p>${esc(c.vibe||'A good book and a table full of readers.')}</p><p>${esc(c.cadence||'Check with the host for the next gathering.')}</p><p>${esc(c.genres.join(', '))}${c.format?` · ${esc(c.format)}`:''}</p>${c.source_name?`<p>Listed by ${esc(c.source_name)}</p>`:''}${c.last_seen?`<p class="small">Listing checked ${esc(c.last_seen)}</p>`:''}<p>Meeting places are shared by the host. The map shows the city center.</p>${ext(appleMapsURL(c),'See city in Apple Maps')}${safeURL(c.source_url)?`<p>${ext(c.source_url!,'Visit the original listing')}</p>`:''}</div><button class="secondary" data-save="${esc(c.id)}" aria-pressed="${!!saved[c.id]}">${saved[c.id]?'♥ Saved on this device':'♡ Save this club'}</button>
  ${c.verified?`<section class="join-section"><h2>Request to join</h2><p>A little hello goes a long way. The host will reply by email.</p><form id="join"><label>Your first name<input name="first_name" maxlength="60" autocomplete="given-name"></label><label>Email<input type="email" name="email" required maxlength="254" autocomplete="email"></label><label>A note for the host<textarea name="note" maxlength="500" rows="3" placeholder="What’s on your nightstand?"></textarea></label><label>Invite code, if you have one<input name="invite_code" maxlength="12" autocapitalize="characters"></label><div class="hp" aria-hidden="true"><input name="website" tabindex="-1" autocomplete="off" aria-label="Leave empty"></div><label class="check"><input type="checkbox" name="consent" required><span>Email me about this request. ${ext('https://meetbookish.com/privacy/','Privacy')}</span></label><button class="primary" type="submit">Request to join</button><p class="form-message" role="status"></p></form></section>`:`<section><h2>A public-calendar gathering</h2><p>Visit the original listing for the current book, meeting date and how to take part.</p>${ext(`https://meetbookish.com/claim/?club_id=${encodeURIComponent(c.id)}&club_name=${encodeURIComponent(c.name)}&club_city=${encodeURIComponent(c.city)}`,'Host this club? Claim it')}</section>`}
  <section class="reminder-section"><h2>Make a date of it</h2><p>Got a date from your host or the listing? Save it here. Times use your device’s time zone.</p>${reminders[c.id]?`<p class="chosen">Meeting: ${new Date(reminders[c.id].meeting).toLocaleString()}</p><button class="text-button" data-cancel="${esc(c.id)}">Remove reminder</button>`:''}<form id="remind"><label>Next meeting<input type="datetime-local" name="meeting" required></label><label>Remind me<select name="minutes"><option value="60">An hour before</option><option value="1440">A day before</option><option value="0">At meeting time</option></select></label><button type="submit" class="primary">Save meeting reminder</button><p class="small">${isNative?'We’ll ask to send a local notification when you save.':'Open the iOS app to schedule a reminder.'}</p><p class="form-message" role="status"></p></form></section>`;
  if(!d.open) d.showModal();
  d.oncancel=()=>{clubId=null;};
}
async function changeTab(t:Tab) { tab=t;clubId=null;render();window.scrollTo(0,0);document.querySelector<HTMLElement>('#main')?.focus({preventScroll:true}); }
async function cancelReminder(id:string) { const r=reminders[id]; if(!r)return; if(isNative) await Notifications.cancel({notifications:[{id:r.id}]}); delete reminders[id]; await persist(); render(); message('Reminder removed. Your club is still saved.'); }
root.addEventListener('input',e=>{const el=e.target as HTMLInputElement;if(el.id==='book-search'){query=el.value;document.querySelector('#book-hits')!.innerHTML=bookHits();}});
root.addEventListener('change',async e=>{const el=e.target as HTMLInputElement;if(el.id==='city'){selectedCity=el.value;pageSize=40;await writeStore('city',selectedCity);render();}if(el.id==='listing'){listing=el.value;pageSize=40;render();}if(el.id==='club-search'){clubQuery=el.value;pageSize=40;render();}});
root.addEventListener('click',async e=>{
  const b=(e.target as HTMLElement).closest<HTMLElement>('button');if(!b)return;
  try {
    if(b.dataset.tab) {await changeTab(b.dataset.tab as Tab);return;}
    if(b.dataset.club){lastDetailTrigger=b;clubId=b.dataset.club;joinStarted=Date.now();renderDetail();return;}
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
  } catch(err){if((err as Error).name!=='AbortError')message((err as Error).message||'Give that another try in a moment.');}
});
root.addEventListener('submit',async e=>{
  e.preventDefault();const form=e.target as HTMLFormElement,c=currentClub();if(!c||!form.reportValidity())return;
  const values=new FormData(form), button=form.querySelector<HTMLButtonElement>('button[type="submit"]')!, status=form.querySelector<HTMLElement>('.form-message')!;
  button.disabled=true;status.textContent='';
  try {
    if(form.id==='join') {
      if(Date.now()-joinStarted<2600)throw new Error('Take a moment with your hello, then tap Request to join.');
      const payload={club_id:c.id,club_name:c.name,first_name:String(values.get('first_name')||''),email:String(values.get('email')||''),note:String(values.get('note')||''),invite_code:String(values.get('invite_code')||''),consent:values.get('consent')==='on',website:String(values.get('website')||''),elapsed_ms:Date.now()-joinStarted};
      const r=await remoteJSON('https://wqnrortftkffmbeugjky.supabase.co/functions/v1/bookish-join',payload);
      if(!r.ok||!r.data.ok)throw new Error(({not_on_bookish:'Visit the original listing to get in touch with this club.',rate_limited:'Your notes are in good hands. Come back a little later for another request.',invite_invalid:'Check your invite code with the host, or leave it blank to send a request.',links_not_allowed:'Keep your note to words and leave links for later.',email:'Add your email so the host can reply.'} as Record<string,string>)[r.data.error]||'Check your connection and give your request another try.');
      status.textContent=r.data.status==='joined'?'You’re in! Check your email for the next chapter.':r.data.status==='already_requested'?'Your hello is already with the host. Keep an eye on your inbox.':r.data.host_notified?'Your hello is on its way. We’ll email you when the host replies.':'Your request is saved. Check back with the club for the next gathering.';
      form.querySelectorAll<HTMLInputElement>('input,textarea,button').forEach(el=>el.disabled=true);
      form.dataset.sent='true';
      return;
    }
    if(form.id==='remind'){
      const meeting=String(values.get('meeting')),minutes=Number(values.get('minutes')),at=reminderDate(meeting,minutes);
      if(!isNative)throw new Error('Open Bookish on your iPhone to save a meeting reminder.');
      if((await Notifications.requestPermissions()).display!=='granted')throw new Error('Enable Bookish notifications in Settings, then save your reminder here.');
      const pending=await Notifications.getPending();if(pending.notifications.length>=60&&!reminders[c.id])throw new Error('Your calendar is wonderfully full. Remove a reminder to make room for this one.');
      const id=reminders[c.id]?.id||(await readStore('reminderSeq',1000))+1;
      await Notifications.schedule({notifications:[{id,title:`A book club kind of day`,body:`${c.name}${minutes?' is coming up.':' meets now.'} Bring your book and your best theory.`,schedule:{at:at.toISOString()},extra:{clubId:c.id}}]});
      saved[c.id]=c;reminders[c.id]={id,meeting:new Date(meeting).toISOString(),minutes,at:at.toISOString()};await writeStore('reminderSeq',id);await persist();render();message('A date for your diary. We’ll give you a nudge.');
    }
  } catch(err) {status.textContent=(err as Error).message||'Check your connection and try once more.';} finally{if(form.dataset.sent!=='true')button.disabled=false;}
});
root.addEventListener('error',e=>{const img=e.target as HTMLImageElement;if(img.tagName==='IMG'&&img.closest('.cover')){const s=document.createElement('span');s.className='typo-cover';s.textContent=img.alt.replace(/^Cover of /,'');img.replaceWith(s);}},true);
root.addEventListener('load',e=>{const img=e.target as HTMLImageElement;if(img.tagName==='IMG'&&img.closest('.cover')&&img.naturalWidth<10)img.dispatchEvent(new Event('error'));},true);
async function openMap(){const result=await CityMap.present({cities:cityGroups(),selected:selectedCity||undefined});if(result.cityKey){selectedCity=result.cityKey;view='list';pageSize=40;await writeStore('city',selectedCity);render();}}
async function refresh(){const ok=await refreshData();refreshStatus=ok?'Fresh from the shelves. Directory updated just now.':'Your saved directory is ready. We’ll try for fresh listings next time.';}
async function start(){
  root.innerHTML='<main class="loading"><img src="/img/wordmark-320.webp" alt="Bookish" width="180"><p>Opening your reading room…</p></main>';
  await loadData();
  [saved,bookSaved,reminders,taste,selectedCity]=await Promise.all([readStore('saved',{}),readStore('bookSaved',[]),readStore('reminders',{}),readStore('taste',taste),readStore('city','')]);
  render();
  if(isNative){await Notifications.addListener('localNotificationActionPerformed',event=>{const id=event.notification.extra?.clubId;if(id&&(saved[id]||data.clubs.some(c=>c.id===id))){tab='saved';clubId=id;joinStarted=Date.now();render();}});await NativeApp.addListener('resume',()=>{void refresh();});}
  // Do not reset an open form, the keyboard or scroll position when launch refresh finishes.
  void refresh().then(()=>{if(!clubId&&document.activeElement===document.body)render();});
}
void start().catch(()=>{root.innerHTML='<main class="loading"><h1>A fresh page awaits.</h1><p>Close and reopen Bookish to reload your bookshelf.</p></main>';});
