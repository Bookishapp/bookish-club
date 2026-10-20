// Public discovery always revalidates against the server. No disk or stale fallback.
(() => {
 const base=document.documentElement.dataset.base||'';
 const api=document.documentElement.dataset.directoryApi;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const safe=s=>{try{const u=new URL(s);return u.protocol==='https:'?u.href:null;}catch{return null;}};
 window.bookishDiscovery=async format=>{
  const r=await fetch(`${api}?format=${format||'clubs'}`,{cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw new Error('Current listings are unavailable. Please try again.');
  const j=await r.json();if(format==='cities'||format==='geojson')return j;
  if(!j.ok||!Array.isArray(j.clubs))throw new Error('Current listings are unavailable. Please try again.');
  return j.clubs;
 };
 const section=document.querySelector('#live-directory');if(!section)return;
 const params=new URLSearchParams(location.search);
 for(const key of ['city','state','genre'])if(params.has(key))section.dataset[key]=params.get(key).slice(0,80);
 const list=document.querySelector('#live-clubs'),status=document.querySelector('#live-status'),query=document.querySelector('#live-query'),more=document.querySelector('#live-more');
 let clubs=[],limit=40,revision=0;
 function draw(){
  const q=query.value.trim().toLowerCase();
  const matches=clubs.filter(c=>(!section.dataset.city||c.city===section.dataset.city)&&(!section.dataset.state||c.state===section.dataset.state)&&(!section.dataset.genre||(c.genres||[]).includes(section.dataset.genre))&&(!q||`${c.name} ${c.city} ${c.state} ${(c.genres||[]).join(' ')}`.toLowerCase().includes(q)));
  status.textContent=matches.length?`${matches.length} clubs. Listings checked just now.`:'No current clubs match. Try another city, or start a club.';
  list.innerHTML=matches.slice(0,limit).map(c=>{
   const link=c.verified?`${base}/join/?club_id=${encodeURIComponent(c.id)}`:safe(c.source_url);
   const action=c.verified?(c.visibility==='open'?'Join club':'Request to join'):'See original listing';
   return `<li class="club ${c.verified?'on':'off'}" id="${esc(c.id)}"><span class="badge ${c.verified?'on':'off'}">${c.verified?(c.visibility==='open'?'Open':'Private'):'Public calendar'}</span><h3>${esc(c.name)}</h3><p class="where">${esc(c.city)}, ${esc(c.state)}</p>${c.current_book?`<p>Reading ${esc(c.current_book.title)}</p>`:''}<div class="foot"><span>${c.verified?(c.visibility==='open'?'Anyone can join.':'The host approves requests.'):'Listed from a public calendar.'}</span>${link?`<a class="join" href="${esc(link)}" ${c.verified?'':'rel="noopener noreferrer" target="_blank"'}>${action}</a>`:''}</div></li>`;
  }).join('');more.hidden=matches.length<=limit;
 }
 async function refresh(){
  const generation=++revision;clubs=[];list.innerHTML='';more.hidden=true;status.textContent='Checking current clubs…';
  try{const value=await window.bookishDiscovery();if(generation!==revision)return;clubs=value;draw();}catch(e){if(generation===revision)status.textContent=e.message;}
 }
 query.addEventListener('input',()=>{limit=40;draw();});more.addEventListener('click',()=>{limit+=40;draw();});
 window.addEventListener('focus',refresh);
 document.addEventListener('visibilitychange',()=>{if(document.hidden){revision++;clubs=[];list.innerHTML='';}else void refresh();});
 void refresh();
})();
