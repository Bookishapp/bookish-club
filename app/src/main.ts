import './styles.css';
import { icon, spot, art } from './design.ts';
import { bookCover } from './book-cover.ts';
import { community } from './community.ts';
import './compositions.css';
import { appAsset } from './paths.ts';
import { calendarEvent } from './calendar.ts';
import { data, loadData, refreshData, clearDiscovery } from './data.ts';
import { esc, cityKey, safeURL, clubURL, appleMapsURL, miles, reminderDate } from './domain.ts';
import type { Club, Book, Taste, Reminder } from './domain.ts';
import { rank, picks, why, moods } from './recommend.ts';
import { isNative, readStore, writeStore, locate, shareClub, remoteJSON, Notifications, NativeApp, CityMap } from './native.ts';

type Tab = 'club'|'near'|'read'|'saved'|'me';
let welcomeShown=false, remindersPrimed=false, savedSection:'clubs'|'books'='clubs', bookDetailId:string|null=null;
const inviteOnLaunch=/^#(?:invite|message)=/i.test(location.hash);
let resolvePrime:((enabled:boolean)=>void)|null=null;
let mePage:'home'|'resources'='home';
const root = document.querySelector<HTMLDivElement>('#app')!;
let tab:Tab='near', selectedCity='', clubId:string|null=null, view='list', listing='all';
let position:{lat:number;lng:number}|null=null, saved:Record<string,Club>={}, bookSaved:string[]=[], reminders:Record<string,Reminder>={};
let taste:Taste={moods:[],length:null,loved:null}, showPicks=false, skipPicks=false, query='', clubQuery='', pageSize=40;
let lastDetailTrigger:HTMLElement|null=null, refreshStatus='Your pocket bookshelf, ready wherever you are.';

const titles:Record<Tab,string> = {club:'Club',near:'Near me',read:'Read next',saved:'Saved',me:'Me'};
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
  return `<li class="club-card ${c.verified?'verified':''}"><button class="club-open" data-club="${esc(c.id)}">${c.current_book?bookCover(undefined,c.current_book.title,'club-cover'):`<span class="club-cover" aria-hidden="true">${spot('openbook',30)}</span>`}<span class="club-copy"><span class="status">${c.verified?'On Bookish':'Not on Bookish yet'}</span><h3>${esc(c.name)}</h3><p>${esc(c.cadence||'Listed from a public calendar')}</p>${c.current_book?`<p class="club-book">Reading <b>${esc(c.current_book.title)}</b></p>`:''}<p class="club-city">${esc(cityKey(c))}${d}</p></span></button><button class="save" data-save="${esc(c.id)}" aria-pressed="${!!saved[c.id]}" aria-label="${saved[c.id]?'Unsave':'Save'} ${esc(c.name)}">${icon('heart')}</button></li>`;
}
function cityPicker() {
  const options=[...new Set(data.clubs.map(cityKey))].sort();
  if(selectedCity&&!options.includes(selectedCity))options.push(selectedCity);
  return `<label class="sr-only" for="city">Your city</label><select id="city"><option value="">${position?'Closest cities':'All cities'}</option>${options.map(key=>`<option ${selectedCity===key?'selected':''} value="${esc(key)}">${esc(key.split(',')[0])}</option>`).join('')}</select>`;
}
function viewSwitch(){return `<div class="switch view-switch" aria-label="Discovery view"><button data-view="list" aria-label="List" aria-pressed="${view==='list'}">${icon('list')}</button><button data-view="map" aria-label="Map" aria-pressed="${view==='map'}">${icon('map')}</button></div>`;}
function welcome(){return `<section class="welcome-screen"><img class="welcome-wordmark" src="${appAsset('img/wordmark-320.webp')}" alt="Bookish"><div class="welcome-stamp">Est. 2026</div><div class="welcome-chips"><span>Find a club</span><span>Meet your people</span><span>Vote the next book</span></div>${art('wave','welcome-art')}<div class="welcome-card"><p class="eyebrow">Good books · your people</p><h1>Pull up a chair.</h1><p>Find a book club near you, or bring your own club.</p><button id="welcome-find" class="primary">Find a club near me</button><button id="redeem-invite" class="secondary">I have an invite code</button><p class="welcome-signin">Already in? <button id="sign-in" class="text-button">Sign in</button></p></div></section>`;}
function near() {
  const groups=cityGroups();
  let clubs=data.clubs.filter(c=>community.visible(c.club_id||c.id)&&(!selectedCity||cityKey(c)===selectedCity)&&(listing==='all'||(listing==='on'?c.verified:!c.verified))&&(!clubQuery||`${c.name} ${c.city} ${c.state} ${c.genres.join(' ')}`.toLowerCase().includes(clubQuery.toLowerCase())));
  if(position&&!selectedCity)clubs=clubs.sort((a,b)=>miles(position!.lat,position!.lng,a.lat??90,a.lng??0)-miles(position!.lat,position!.lng,b.lat??90,b.lng??0));
  if(data.discovery!=='ready')return `<section class="full-empty network-state" role="status">${art(data.discovery==='loading'?'peek':'map','full-empty-art')}<p class="eyebrow">Near me</p><h1>${data.discovery==='loading'?'Opening the directory…':'The directory needs a connection.'}</h1><p>${data.discovery==='loading'?'Finding the latest clubs and their city centers.':'Your saved books are still here. Reconnect, and give the directory another try.'}</p>${data.discovery==='unavailable'?'<button id="refresh" class="primary">Try the directory again</button>':''}</section>`;
  const matching=data.clubs.filter(c=>community.visible(c.club_id||c.id)&&(!selectedCity||cityKey(c)===selectedCity)&&(!clubQuery||`${c.name} ${c.city} ${c.state} ${c.genres.join(' ')}`.toLowerCase().includes(clubQuery.toLowerCase())));
  const on=matching.filter(c=>c.verified).length,calendar=matching.length-on;
  const header=`<header class="discovery-header"><div class="discovery-city"><div><p class="eyebrow">Near me</p><div class="city-count">${cityPicker()}<span>· ${clubs.length} clubs</span></div></div>${viewSwitch()}</div><div class="search-field">${icon('search')}<label class="sr-only" for="club-search">Find a club or genre</label><input id="club-search" type="search" value="${esc(clubQuery)}" placeholder="Romance, mystery, a club name"><button id="finder-filters" aria-label="City and listing filters">${icon('filter')}</button></div><div class="listing-chips"><button class="chip ${listing!=='calendar'?'on':''}" data-listing="${listing==='on'?'all':'on'}">On Bookish · ${on}</button><button class="chip ${listing==='calendar'?'on':''}" data-listing="${listing==='calendar'?'all':'calendar'}">Listed from public calendars · ${calendar}</button></div><details id="finder-options"><summary>City and listing filters</summary><button class="secondary" id="locate">${icon('locate')} Near me</button><label for="listing">Show listings</label><select id="listing"><option value="all" ${listing==='all'?'selected':''}>All clubs</option><option value="on" ${listing==='on'?'selected':''}>On Bookish</option><option value="calendar" ${listing==='calendar'?'selected':''}>Public calendars</option></select><p class="small">Your location stays on this device. City centers only.</p></details></header>`;
  if(view==='map')return `<section class="map-screen">${browserMap(groups)}<div class="map-toolbar">${cityPicker()}${viewSwitch()}</div><span class="chip map-privacy">City level only · never an address</span><button class="map-locate" id="locate" aria-label="Use my location">${icon('locate')}</button>${isNative?'<button class="map-native secondary" id="native-map">Open city map</button>':''}<section class="map-bottom-sheet"><div class="sheet-handle"></div><h2>${esc(selectedCity||groups[0]?.name||'Bookish cities')} · ${clubs.length} clubs</h2><p>${on} on Bookish · ${calendar} listed from public calendars</p><ul class="map-club-carousel">${clubs.slice(0,8).map(c=>`<li><button data-club="${esc(c.id)}">${bookCover(undefined,c.current_book?.title||c.name)}<span><strong>${esc(c.name)}</strong><small>${esc(c.genres[0]||c.city)}</small></span></button></li>`).join('')}</ul><button data-view="list" class="primary">See all ${clubs.length}${selectedCity?` in ${esc(selectedCity.split(',')[0])}`:''}</button></section></section>`;
  return (clubs.length?header+`<ul class="clubs discovery-list">${clubs.slice(0,pageSize).map(clubCard).join('')}</ul>${clubs.length>pageSize?'<button id="more" class="secondary">More clubs</button>':''}`:`<section class="full-empty near-empty">${art('map','full-empty-art')}<p class="eyebrow">Near me${selectedCity?' · '+esc(selectedCity):''}</p><h1>No clubs here yet.</h1><p>Which means the best one in town hasn’t started. It could be yours.</p><button id="create-club" class="primary">Start a club${selectedCity?' in '+esc(selectedCity.split(',')[0]):''}</button><button id="clear-city" class="text-button">Look in a bigger city nearby</button><button id="refresh" class="text-button">Refresh directory</button></section>`)+`<button id="redeem-invite" class="invite-entry">I have an invite code</button>`;
}
function browserMap(groups:ReturnType<typeof cityGroups>){
  const focus=groups.find(g=>g.key===selectedCity)||groups[0];
  const shown=selectedCity&&focus?groups.filter(g=>miles(focus.lat,focus.lng,g.lat,g.lng)<100):groups;
  const lats=shown.map(g=>g.lat),lngs=shown.map(g=>g.lng);
  const minLat=Math.min(...lats),maxLat=Math.max(...lats),minLng=Math.min(...lngs),maxLng=Math.max(...lngs);
  const x=(lng:number)=>maxLng===minLng?50:12+(lng-minLng)/(maxLng-minLng)*76;
  const y=(lat:number)=>maxLat===minLat?44:20+(maxLat-lat)/(maxLat-minLat)*40;
  return `<div class="city-map full-map"><svg viewBox="0 0 390 844" preserveAspectRatio="none" aria-hidden="true"><defs><pattern id="map-grid" width="26" height="26" patternUnits="userSpaceOnUse"><path d="M26 0H0V26" fill="none" stroke="#4a14200c"/></pattern></defs><rect width="390" height="844" fill="#efe3cf"/><rect width="390" height="844" fill="url(#map-grid)"/><path d="M-20 300C60 280 120 340 170 330S260 260 410 300" stroke="#a9cbc3" stroke-width="7" fill="none"/><path d="M230-10C220 200 250 380 215 560S190 760 205 860M-10 520C120 500 260 470 400 430" stroke="#e7c98a" stroke-width="4" fill="none"/><path d="M60-10C90 200 70 500 120 860M330 120C300 300 340 500 300 860" stroke="#eadac2" stroke-width="3" fill="none"/></svg><div class="map-pins" aria-label="Clubs grouped at city centers">${shown.slice(0,60).map(g=>`<button class="map-cluster ${focus===g?'selected':''}" data-map-city="${esc(g.key)}" style="left:${x(g.lng)}%;top:${y(g.lat)}%" aria-label="${esc(g.name)}, ${g.count} clubs"><strong>${g.count}</strong><span>${esc(g.name.split(',')[0])}</span></button>`).join('')}</div><span class="map-caption">Illustrated overview · City centers</span></div>`;
}
function cover(b:Book) {return `<button class="cover" data-book-detail="${esc(b.id)}" aria-label="About ${esc(b.t)}">${bookCover(b.id,b.t)}</button>`;}
function bookCard(b:Book,line='') {return `<li class="book-card">${cover(b)}<div><h3><button class="book-title-button" data-book-detail="${esc(b.id)}">${esc(b.t)}</button></h3><p>${esc(b.a)}${b.p?` · ${b.p} pages`:''}</p>${line?`<p class="why">${esc(line)}</p>`:''}<button class="text-button" data-book-save="${esc(b.id)}" aria-pressed="${bookSaved.includes(b.id)}">${icon('saved')} ${bookSaved.includes(b.id)?'Saved':'Save book'}</button></div></li>`;}
function shelf(title:string,books:Book[]){return books.length?`<section class="book-shelf"><h2>${esc(title)}</h2><ul>${books.map(b=>`<li>${cover(b)}<button class="shelf-title" data-book-detail="${esc(b.id)}">${esc(b.t)}</button><p>${esc(b.a)}</p><button class="text-button" data-book-save="${esc(b.id)}" aria-pressed="${bookSaved.includes(b.id)}">${bookSaved.includes(b.id)?'Saved':'Save'}</button></li>`).join('')}</ul></section>`:'';}
function read() {
  if(showPicks){
    const t=skipPicks?{moods:[],length:null,loved:null}:taste,ranked=rank(data.books,data.community,t),top=skipPicks?ranked.slice(0,3):picks(data.books,t,ranked),by=new Map(data.books.map(b=>[b.id,b]));
    const city=selectedCity.split(', '),stats=data.community.city.filter(r=>r.city===city[0]&&r.state===city[1]),communityPicks=stats.length?stats:data.community.national;
    const first=top[0];const loved=by.get(t.loved||'');
    const after=loved?data.community.next.filter(r=>r.from_book===loved.id).sort((a,b)=>b.clubs-a.clubs).flatMap(r=>by.has(r.to_book)?[by.get(r.to_book)!]:[]):[];
    return `<header class="read-heading"><p class="eyebrow">Read next</p><h1>Stuck on what’s next?</h1><button id="redo" class="text-button">Change my taste</button></header>${first?`<article class="recommendation-hero">${cover(first.b)}<div><span class="status">Just for you</span><h2><button class="book-title-button" data-book-detail="${esc(first.b.id)}">${esc(first.b.t)}</button></h2><p>${esc(first.b.a)}</p><p class="why">${esc(why(first,t))}</p></div></article>`:''}${shelf(stats.length?`${city[0]} clubs loved`:communityPicks.length?'Clubs on Bookish loved':'A few for your shelf',communityPicks.length?communityPicks.flatMap(r=>by.has(r.book_id)?[by.get(r.book_id)!]:[]).slice(0,8):top.slice(1).map(r=>r.b))}${after.length?shelf(`After ${loved!.t}, clubs read`,after.slice(0,8)):''}${(t.moods.length?t.moods:['short','mystery','cry']).slice(0,3).map(m=>shelf(moods[m],ranked.filter(r=>r.b.m.includes(m)&&r!==first).slice(0,7).map(r=>r.b))).join('')}<p class="small">Covers and details from ${ext('https://openlibrary.org/','Open Library')}.</p>`;
  }
  const favoriteIds=['a-court-of-thorns-and-roses','the-seven-husbands-of-evelyn-hugo','the-night-circus','circe'];
  const favoriteBooks=favoriteIds.flatMap(id=>{const b=data.books.find(b=>b.id===id);return b?[b]:[];});
  const loved=data.books.find(b=>b.id===taste.loved);if(loved&&!favoriteBooks.includes(loved))favoriteBooks.unshift(loved);
  return `<section class="taste-screen"><div class="taste-top"><button data-tab="near" class="text-button">${icon('back')} Back</button><button id="skip" class="text-button">Skip</button></div><p class="eyebrow">A book for your kind of night</p><h1>What are you in the mood for?</h1><p>Pick a few. We’ll find your next good read.</p><div class="mood-chips">${Object.entries(moods).map(([k,v])=>`<button class="chip ${taste.moods.includes(k)?'on':''}" data-mood="${k}" aria-pressed="${taste.moods.includes(k)}">${spot(({fight:'masks',slow_burn:'flower',mystery:'eyes',cry:'cry',big_fantasy:'moon',short:'openbook'} as Record<string,string>)[k],22)}${esc(({fight:'Lively debate',slow_burn:'Slow burn',mystery:'Twisty',cry:'Big feelings',big_fantasy:'Dragons',short:'Weekend read'} as Record<string,string>)[k]||v)}</button>`).join('')}</div><h2 class="field-label">Books you loved</h2><div class="loved-covers">${favoriteBooks.map(b=>`<button data-loved="${esc(b.id)}" aria-label="Loved ${esc(b.t)}" aria-pressed="${taste.loved===b.id}">${bookCover(b.id,b.t)}${taste.loved===b.id?`<span class="loved-check">${icon('check')}</span>`:''}</button>`).join('')}</div><label class="sr-only" for="book-search">Add a book you loved</label><div class="search-field">${icon('search')}<input type="search" id="book-search" value="${esc(query)}" placeholder="Add a book you loved"></div><div id="book-hits">${bookHits()}</div><div class="taste-city"><h2 class="field-label">Where do you read?</h2>${cityPicker()}<span class="small">City only</span></div><h2 class="field-label">A little or a lot?</h2><div class="length-chips">${Object.entries({short:'Under 300 pages',mid:'300 to 450 pages',long:'A long, lovely read',any:'Any length'}).map(([k,v])=>`<button class="chip ${taste.length===k?'on':''}" data-length="${k}" aria-pressed="${taste.length===k}">${v}</button>`).join('')}</div><button class="primary" id="next">Find my next read</button></section>`;
}
function bookHits(){const selected=data.books.find(b=>b.id===taste.loved);return `${selected?`<p class="chosen">Your pick: ${esc(selected.t)} <button class="text-button" id="clear-loved">Change</button></p>`:''}${query.length>1?`<ul class="search-hits">${data.books.filter(b=>`${b.t} ${b.a}`.toLowerCase().includes(query.toLowerCase())).slice(0,8).map(b=>`<li><button data-loved="${esc(b.id)}">${esc(b.t)}<small>${esc(b.a)}</small></button></li>`).join('')||'<li>Try another favorite, or skip this book.</li>'}</ul>`:''}`;}
function visibleSavedClubs(){return Object.values(saved).flatMap(c=>{const live=data.clubs.find(x=>x.id===c.id);return live&&community.visible(live.club_id||live.id)?[live]:[];});}
function savedView(){
  const clubs=visibleSavedClubs(),books=data.books.filter(b=>bookSaved.includes(b.id));
  const dates=Object.entries(reminders).filter(([id,r])=>new Date(r.meeting)>new Date()&&community.visible(saved[id]?.club_id||id));
  if(!clubs.length&&!books.length)return `<section class="full-empty saved-empty">${art('peek','full-empty-art')}<p class="eyebrow">Saved</p><h1>Nothing saved yet.</h1><p>Tap the heart on any club or save a book, and it lands here. Your little stack, ready when you are.</p><button class="primary" data-tab="near">Find clubs near me</button></section>`;
  return `<header class="saved-heading"><p class="eyebrow">Saved</p><h1>Your little stack.</h1></header><div class="saved-segments"><button data-saved-section="clubs" aria-pressed="${savedSection==='clubs'}">Clubs · ${clubs.length}</button><button data-saved-section="books" aria-pressed="${savedSection==='books'}">Books · ${books.length}</button></div>${dates.map(([id,r])=>`<div class="reminder-banner">${spot('calendar',32)}<div><strong>${esc(saved[id]?.name||'Book club')} meets ${new Date(r.meeting).toLocaleDateString([],{weekday:'long'})}</strong><p>Reminder set for ${r.minutes===1440?'a day before':r.minutes===60?'an hour before':'meeting time'}</p></div><button class="text-button" data-club="${esc(id)}">Edit</button><button class="text-button" data-cancel="${esc(id)}">Remove reminder</button></div>`).join('')}${savedSection==='clubs'?`<ul class="clubs">${clubs.map(clubCard).join('')}</ul>${!clubs.length?'<p>Save a club from Near me to start this stack.</p>':''}`:`<ul class="books saved-books">${books.map(b=>bookCard(b)).join('')}</ul>${!books.length?'<p>Save a book from Read next to start this shelf.</p>':''}`}`;
}
function me(){return `${community.accountView()}${community.signedIn?shelf('My shelf',data.books.filter(b=>bookSaved.includes(b.id))):''}<section class="profile-resources"><h2>Resources</h2><p>Discussion guides, hosting tips, and printables.</p><button id="open-resources" class="settings-link">Explore Resources ${icon('chev')}</button><details class="device-details"><summary>Your pocket reading room</summary><p>Your saved clubs, books, taste, and reminders stay on this device. Your account, memberships, join notes, and anonymous votes sync with Bookish. Meeting details stay inside your club.</p><p>Covers and details from ${ext('https://openlibrary.org/','Open Library')}.</p><p>${esc(refreshStatus)}</p><button id="refresh" class="secondary">Refresh directory</button><p>${ext('https://meetbookish.com/privacy/','Privacy')} · ${ext('https://meetbookish.com/terms/','Terms')} · ${ext('https://meetbookish.com/about/','About our sources')}</p><a href="mailto:hello@meetbookish.com">Say hello</a></details></section>`;}
function resources() { return `<header class="intro with-art">${art('b-tea','hero-art')}<button id="back-to-me" class="light-button">Back to Me</button><p class="hello">For a lovely gathering.</p><h1>Resources</h1><p>Good company, a good book, and a little inspiration.</p></header><section class="paper links" aria-label="Reading and hosting resources">${ext('https://meetbookish.com/resources/','Discussion guides and reading resources')}${ext('https://meetbookish.com/resources/hosting-tips/','Hosting tips')}${ext('https://meetbookish.com/resources/pairings/','Snacks and drink pairings')}${ext('https://meetbookish.com/resources/printables/','Printable bookmarks and RSVP cards')}<p class="small">These resources open in your browser.</p></section>`; }
function render() {
  if(resolvePrime){resolvePrime(false);resolvePrime=null;}
  const scroll=window.scrollY;
  root.innerHTML=`<div class="app-shell ${welcomeShown?'welcome-mode':tab==='near'&&view==='map'?'map-mode':tab==='read'&&!showPicks?'taste-mode':''}"><div class="mast"><img src="${appAsset('img/wordmark-320.webp')}" width="144" height="68" alt="Bookish"><span>A book club kind of night.</span></div><main id="main" tabindex="-1">${welcomeShown?welcome():tab==='club'?community.clubView():tab==='near'?near():tab==='read'?read():tab==='saved'?savedView():mePage==='resources'?resources():me()}</main><nav class="tabs" aria-label="Main navigation">${(Object.keys(titles) as Tab[]).map(t=>`<button data-tab="${t}" ${tab===t?'aria-current="page"':''}>${icon(t)}${titles[t]}</button>`).join('')}</nav></div><dialog id="detail" aria-labelledby="detail-title"></dialog><dialog id="notification-prime-dialog" aria-labelledby="prime-title"></dialog>`;
  window.scrollTo(0,scroll);
  if(clubId) renderDetail();
  if(bookDetailId)renderBookDetail();
  community.rendered();
}
function currentClub() { return data.clubs.find(c=>c.id===clubId&&community.visible(c.club_id||c.id))||null; }
function renderBookDetail(){
  const b=data.books.find(b=>b.id===bookDetailId);if(!b){bookDetailId=null;return;}
  const d=document.querySelector<HTMLDialogElement>('#detail')!;delete d.dataset.community;d.className='book-detail-sheet';d.dataset.bookDetail=b.id;
  d.innerHTML=`<div class="book-detail-top"><button id="close-book-detail" class="text-button">${icon('back')} Back</button><button class="text-button" data-book-save="${esc(b.id)}" aria-pressed="${bookSaved.includes(b.id)}">${icon('saved')} ${bookSaved.includes(b.id)?'Saved':'Save'}</button></div><div class="book-detail-cover">${bookCover(b.id,b.t)}${art('b-swoon','book-detail-art')}</div><div class="book-detail-copy"><h1 id="detail-title">${esc(b.t)}</h1><p>${esc(b.a)}${b.p?` · ${b.p} pages`:''}</p><div class="book-mood-chips">${b.m.map(m=>`<span class="chip">${esc(moods[m]||m.replaceAll('_',' '))}</span>`).join('')}</div><p class="book-note">${esc(why(rank(data.books,data.community,taste).find(r=>r.b.id===b.id)||{b,score:0,tasteS:0,lovedS:0,sequel:false},taste))}</p></div><div class="book-detail-actions"><button class="secondary" data-book-save="${esc(b.id)}" aria-pressed="${bookSaved.includes(b.id)}">${icon('saved')} ${bookSaved.includes(b.id)?'Saved':'Save book'}</button>${b.ol?ext(`https://openlibrary.org/works/${b.ol}`,'Read about this book'):'<p class="small">Book details from Open Library.</p>'}</div>`;
  if(!d.open)d.showModal();d.oncancel=()=>{bookDetailId=null;delete d.dataset.bookDetail;};
}
function renderDetail(){
  const c=currentClub();if(!c){clubId=null;document.querySelector<HTMLDialogElement>('#detail')?.close();return;}
  const d=document.querySelector<HTMLDialogElement>('#detail')!;delete d.dataset.community;delete d.dataset.bookDetail;d.className=`public-club-detail ${c.verified?'verified-detail':'unclaimed-detail'}`;
  const source=safeURL(c.source_url),claim=`https://meetbookish.com/claim/?club_id=${encodeURIComponent(c.id)}&club_name=${encodeURIComponent(c.name)}&club_city=${encodeURIComponent(c.city)}`;
  d.innerHTML=`<div class="detail-head"><button id="close-detail" class="text-button">${icon('back')} Close</button><button id="share" class="text-button">${icon('share')} Share club</button><button class="save" data-save="${esc(c.id)}" aria-pressed="${!!saved[c.id]}" aria-label="${saved[c.id]?'Unsave':'Save'} club">${icon('heart')}</button></div>${c.verified?`<header class="club-green-hero"><span class="status">${icon('check')} On Bookish · ${c.visibility==='open'?'Open club':'Private club'}</span><div class="taped-title"><h1 id="detail-title">${esc(c.name)}</h1></div><p>${icon('pin')} ${esc(cityKey(c))}</p>${art('b-laugh','club-hero-art')}</header><div class="club-detail-content">${c.current_book?`<section class="club-reading"><p class="eyebrow">Reading now</p><div class="reading-now-card">${bookCover(undefined,c.current_book.title)}<div><h2>${esc(c.current_book.title)}</h2><p>${esc(c.current_book.authors.join(', '))}</p></div></div></section>`:''}<section class="club-vibe"><p class="eyebrow">The vibe</p><p>${esc(c.vibe||'A good book and a table full of readers.')}</p><div class="vibe-chips">${c.genres.map(g=>`<span class="chip">${esc(g)}</span>`).join('')}${c.format?`<span class="chip g">${esc(c.format)}</span>`:''}<span class="chip">18+</span></div>${c.cadence?`<p class="small">${esc(c.cadence)}</p>`:''}</section><p class="small">${icon('lock')} Meeting places are shared by the host. Discovery shows the city center.</p><div class="club-join-actions"><button class="primary" id="account-join-club">${c.visibility==='open'?'Join club':'Request to join'}</button><p class="small">${c.visibility==='open'?'Pull up your chair. Sign in to join your readers.':'The host approves new members. The address comes after.'}</p></div></div>`:`<div class="unclaimed-content"><span class="status">Not on Bookish yet · Public calendar</span><h1 id="detail-title">${esc(c.name)}</h1><p>${esc(cityKey(c))}${c.last_seen?' · Listing checked '+esc(c.last_seen):''}</p><section class="unclaimed-card"><h2>This club hasn’t joined Bookish.</h2><p>So there’s no way to request a seat here. See where it meets on the organizer’s own page.</p>${source?`<a class="secondary" href="${esc(source)}" target="_blank" rel="noopener noreferrer">See where it meets</a>`:'<p class="small">The organizer’s listing is unavailable right now.</p>'}${c.source_name?`<p class="small">Listed by ${esc(c.source_name)}</p>`:''}</section><section class="claim-card"><h2>Is this your club?</h2><p>Claim it to gather your readers on Bookish.</p><a class="primary" href="${esc(claim)}" target="_blank" rel="noopener noreferrer">Claim this club</a></section>${art('peek','unclaimed-art')}</div>`}<div class="detail-extras"><button class="secondary" data-save="${esc(c.id)}" aria-pressed="${!!saved[c.id]}">${icon('heart')} ${saved[c.id]?'Saved on this device':'Save this club'}</button><p>${ext(appleMapsURL(c),'See city in Apple Maps')}</p>${c.verified?`<button class="text-button" data-content="${esc(c.club_id||c.id)}" data-kind="club" data-label="${esc(c.name)}">Report or block this club</button>`:''}<section class="reminder-section"><h2>Make a date of it.</h2><p>Got a date from your host or the listing? Save it here. Times use your device’s time zone.</p><button id="notification-prime" class="text-button">Never miss club night</button>${reminders[c.id]?`<p class="chosen">Meeting: ${new Date(reminders[c.id].meeting).toLocaleString()}</p><button class="text-button" data-cancel="${esc(c.id)}">Remove reminder</button>`:''}<form id="remind"><label>Next meeting<input type="datetime-local" name="meeting" required></label><label>Remind me<select name="minutes"><option value="60">An hour before</option><option value="1440">A day before</option><option value="0">At meeting time</option></select></label><button type="submit" class="primary">${isNative?'Save meeting reminder':'Download calendar reminder'}</button><p class="small">${isNative?'We’ll ask to send a local notification when you save.':'Download a calendar file with your meeting and reminder.'}</p><p class="form-message" role="status"></p></form></section></div>`;
  if(!d.open)d.showModal();d.oncancel=()=>{clubId=null;};
}
function showNotificationPrime():Promise<boolean>{
  const d=document.querySelector<HTMLDialogElement>('#notification-prime-dialog')!;d.className='notifications-prime';
  d.innerHTML=`${art('calendar','prime-art')}<div class="sample-notification"><img src="${appAsset('img/icon.png')}" alt=""><div><strong>Bookish <span>Sample</span></strong><p>Your book club meets tomorrow. Bring your book and your best theory.</p></div></div><div class="prime-copy"><h1 id="prime-title">Never miss club night.</h1><p>A reminder before your meeting. A little nudge to make a night of it.</p><p class="small">${isNative?'Bookish will ask to send local notifications for the meeting reminders you save.':'On the web, save your meeting to your calendar. In the iPhone app, Bookish can send a local reminder.'}</p></div><div class="prime-actions"><button class="primary" id="prime-enable">Turn on reminders</button><button class="text-button" id="prime-later">Maybe later</button></div>`;
  d.showModal();d.oncancel=()=>{resolvePrime?.(false);resolvePrime=null;};
  return new Promise(resolve=>{resolvePrime=resolve;});
}
async function changeTab(t:Tab) { tab=t;mePage='home';clubId=null;bookDetailId=null;render();window.scrollTo(0,0);document.querySelector<HTMLElement>('#main')?.focus({preventScroll:true}); }
async function cancelReminder(id:string) { const r=reminders[id]; if(!r)return; if(isNative) await Notifications.cancel({notifications:[{id:r.id}]}); delete reminders[id]; await persist(); render(); message('Reminder removed. Your club is still saved.'); }
root.addEventListener('input',e=>{const el=e.target as HTMLInputElement;if(el.id==='book-search'){query=el.value;document.querySelector('#book-hits')!.innerHTML=bookHits();}});
root.addEventListener('change',async e=>{const el=e.target as HTMLInputElement;if(el.id==='city'){selectedCity=el.value;pageSize=40;await writeStore('city',selectedCity);render();}if(el.id==='listing'){listing=el.value;pageSize=40;render();}if(el.id==='club-search'){clubQuery=el.value;pageSize=40;render();}});
root.addEventListener('click',async e=>{
  const b=(e.target as HTMLElement).closest<HTMLElement>('button');if(!b)return;
  try {
    if(welcomeShown&&(b.id==='welcome-find'||b.id==='redeem-invite'||b.id==='sign-in')){welcomeShown=false;await writeStore('welcomeSeen',true);if(b.id==='welcome-find'){render();window.scrollTo(0,0);return;}render();}
    if(b.id==='prime-enable'||b.id==='prime-later'){document.querySelector<HTMLDialogElement>('#notification-prime-dialog')!.close();resolvePrime?.(b.id==='prime-enable');resolvePrime=null;return;}
    if(b.id==='notification-prime'){if(await showNotificationPrime()){if(isNative){const permission=await Notifications.requestPermissions();if(permission.display!=='granted')message('Enable Bookish notifications in Settings, then save your reminder here.');}else message('Save your meeting below to download its calendar reminder.');}return;}
    if(b.dataset.bookDetail){bookDetailId=b.dataset.bookDetail;renderBookDetail();return;}
    if(b.id==='close-book-detail'){document.querySelector<HTMLDialogElement>('#detail')!.close();bookDetailId=null;return;}
    if(b.dataset.savedSection){savedSection=b.dataset.savedSection as typeof savedSection;render();return;}
    if(b.dataset.listing){listing=b.dataset.listing;render();return;}
    if(b.id==='finder-filters'){const details=document.querySelector<HTMLDetailsElement>('#finder-options')!;details.open=!details.open;return;}
    if(b.id==='clear-city'){selectedCity='';clubQuery='';listing='all';await writeStore('city','');render();return;}
    if(community.handles(b)){await community.click(b);return;}
    if(b.id==='account-join-club'){if(currentClub())await community.join(currentClub()!.id,{name:currentClub()!.name});return;}
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
    if(b.id==='next'||b.id==='skip'){skipPicks=b.id==='skip';showPicks=true;await writeStore('taste',taste);render();window.scrollTo(0,0);return;}
    if(b.id==='redo'){showPicks=false;render();return;}
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
      if(!remindersPrimed){if(!await showNotificationPrime())return;remindersPrimed=true;await writeStore('remindersPrimed',true);}
      if((await Notifications.requestPermissions()).display!=='granted')throw new Error('Enable Bookish notifications in Settings, then save your reminder here.');
      const pending=await Notifications.getPending();if(pending.notifications.length>=60&&!reminders[c.id])throw new Error('Your calendar is wonderfully full. Remove a reminder to make room for this one.');
      const id=reminders[c.id]?.id||(await readStore('reminderSeq',1000))+1;
      await Notifications.schedule({notifications:[{id,title:`A book club kind of day`,body:`${c.name}${minutes?' is coming up.':' meets now.'} Bring your book and your best theory.`,schedule:{at},extra:{clubId:c.id}}]});
      saved[c.id]=c;reminders[c.id]={id,meeting:new Date(meeting).toISOString(),minutes,at:at.toISOString()};await writeStore('reminderSeq',id);await persist();render();message('A date for your diary. We’ll give you a nudge.');
    }
  } catch(err) {status.textContent=(err as Error).message||'Check your connection and try once more.';} finally{if(form.dataset.sent!=='true')button.disabled=false;}
});
root.addEventListener('error',e=>{const img=e.target as HTMLImageElement;if(img.tagName==='IMG'&&img.closest('.community-book-cover')){img.remove();}},true);
root.addEventListener('load',e=>{const img=e.target as HTMLImageElement;if(img.tagName==='IMG'&&img.closest('.community-book-cover')&&img.naturalWidth<10)img.dispatchEvent(new Event('error'));},true);
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
  root.innerHTML=`<main class="loading"><img src="${appAsset('img/wordmark-320.webp')}" alt="Bookish" width="180">${art('b-peek')}<p>Opening your reading room…</p></main>`;
  await loadData();
  const prior=await readStore<unknown>('saved',[]);
  const ids=Array.isArray(prior)?prior:prior&&typeof prior==='object'?Object.keys(prior):[];
  saved=Object.fromEntries(data.clubs.filter(c=>ids.includes(c.id)).map(c=>[c.id,c]));
  await writeStore('saved',Object.keys(saved));
  [bookSaved,reminders,taste,selectedCity]=await Promise.all([readStore('bookSaved',[]),readStore('reminders',{}),readStore('taste',taste),readStore('city','')]);
  welcomeShown=!inviteOnLaunch&&!await readStore('welcomeSeen',false);
  remindersPrimed=await readStore('remindersPrimed',false);
  render();
  if(isNative){await NativeApp.addListener('appUrlOpen',event=>{if(event.url)void community.openMessage(event.url);});const launch=await NativeApp.getLaunchUrl();if(launch?.url)await community.openMessage(launch.url);await Notifications.addListener('localNotificationActionPerformed',event=>{const id=event.notification.extra?.clubId;if(id&&(saved[id]||data.clubs.some(c=>c.id===id))){tab='saved';clubId=id;render();}});await NativeApp.addListener('resume',()=>{void refresh();});}
  window.addEventListener('focus',()=>{void refresh();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clearDiscovery();saved={};clubId=null;render();}else void refresh();});
}
void start().catch(()=>{root.innerHTML=`<main class="loading">${art('b-sleepy')}<h1>A fresh page awaits.</h1><p>Close and reopen Bookish to reload your bookshelf.</p></main>`;});
