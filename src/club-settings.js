(() => {
 const root=document.querySelector('#host-settings');if(!root)return;
 const api=(document.documentElement.dataset.directoryApi||'').replace(/bookish-directory(?:\?.*)?$/,'bookish-club-settings');
 const status=document.querySelector('#host-status'),controls=document.querySelector('#host-controls'),form=document.querySelector('#host-link');
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let token='',club='';
 function readLink(link){const u=new URL(link,location.href),p=new URLSearchParams(u.hash.slice(1));token=p.get('host')||'';club=p.get('club')||'';}
 function draw(data){
  form.hidden=true;const c=data.club;
  controls.innerHTML=`<h2>${esc(c.name)}</h2><p>${esc(c.city)}, ${esc(c.state)}</p><form id="visibility-form" class="form"><fieldset class="mapq"><legend>Who can find and join your club?</legend>${[['open','Open: on the map and in search; anyone can join.'],['private','Private: on the map with your name, area, and current book; you approve requests.'],['hidden','Hidden: invite code or link only.']].map(([value,label])=>`<label class="check"><input type="radio" name="visibility" value="${value}" required ${c.visibility===value?'checked':''}>${label}</label>`).join('')}</fieldset><button class="btn">Save visibility</button></form><section><h3>Invite readers</h3><p>Invites last seven days and allow 20 joins. Rotating cancels the previous code immediately.</p>${data.invite?`<p>Code: <b>${esc(data.invite)}</b></p><label>Invite link<input readonly value="${esc(`${location.origin}${document.documentElement.dataset.base||''}/join/#club=${encodeURIComponent(c.id)}&invite=${data.invite}`)}"></label>`:'<p>No active invite.</p>'}<button class="btn" type="button" data-rotate>Rotate invite code</button></section><section><h3>Join requests</h3>${data.requests.length?data.requests.map(r=>`<article><h4>${esc(r.first_name||'A reader')}</h4><p>${esc(r.email)}</p><p>${esc(r.note)}</p><button class="btn" type="button" data-request="${esc(r.id)}" data-approve="true">Approve</button> <button type="button" data-request="${esc(r.id)}" data-approve="false">Decline</button></article>`).join(''):'<p>No pending requests.</p>'}</section>`;
 }
 let busy=false;
 async function send(action,extra={}){
  if(busy)return;busy=true;status.textContent='Saving…';controls.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{const r=await fetch(api,{method:'POST',cache:'no-store',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({club_id:club,action,...extra})});const j=await r.json();if(!r.ok||!j.ok)throw new Error('Open the original host link from your confirmation email.');draw(j);status.textContent=action==='save'?'Visibility saved. Discovery uses the new setting immediately.':action==='rotate'?'New invite ready. The previous code no longer works.':'Club settings are current.';}
  catch(e){status.textContent=e.message;form.hidden=false;controls.innerHTML='';}
  finally{busy=false;controls.querySelectorAll('button').forEach(b=>b.disabled=false);}
 }
 form.addEventListener('submit',e=>{e.preventDefault();try{readLink(form.elements.link.value);form.reset();void send('get');}catch{status.textContent='Paste your complete host link.';}});
 controls.addEventListener('submit',e=>{e.preventDefault();const f=e.target;if(f.id==='visibility-form'&&f.reportValidity())void send('save',{visibility:new FormData(f).get('visibility')});});
 controls.addEventListener('click',e=>{const b=e.target.closest('button');if(b?.hasAttribute('data-rotate'))void send('rotate');if(b?.dataset.request)void send('decide',{request_id:b.dataset.request,approve:b.dataset.approve==='true'});});
 if(location.hash){readLink(location.href);history.replaceState(null,'',location.pathname);void send('get');}
})();
