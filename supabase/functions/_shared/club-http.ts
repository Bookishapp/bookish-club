// These handlers are also exercised against local PostgreSQL in tests.
type Client = { rpc(name: string, args?: Record<string, unknown>): PromiseLike<{data: any; error: any}> };
const origins = ['https://meetbookish.com','https://www.meetbookish.com','https://bookishapp.github.io','https://fictora.github.io','http://localhost:4321','http://127.0.0.1:4321','capacitor://localhost','https://localhost'];
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const clean = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0,max) : '';
const slug = (s:string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
function response(req:Request, body:unknown, status=200) {
 const origin=req.headers.get('origin');
 return new Response(body===null?null:JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store, max-age=0','pragma':'no-cache','access-control-allow-origin':origin&&origins.includes(origin)?origin:origins[0],'access-control-allow-headers':'authorization, content-type','access-control-allow-methods':'GET, POST, OPTIONS','vary':'Origin','referrer-policy':'no-referrer'}});
}
function guard(req:Request,method:string) {
 if(req.method==='OPTIONS')return response(req,null,204);
 if(req.method!==method)return response(req,{ok:false,error:'method'},405);
 const origin=req.headers.get('origin');
 if(origin&&!origins.includes(origin))return response(req,{ok:false,error:'origin'},403);
}
async function body(req:Request) {
 const text=await req.text();if(text.length>8000)throw new Error('too_large');
 const value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('bad_json');return value;
}
function badBody(req:Request,e:unknown){const large=(e as Error).message==='too_large';return response(req,{ok:false,error:large?'too_large':'bad_json'},large?413:400);}
export function directoryHandler(client:Client, defaultFormat='clubs') {
 return async(req:Request)=>{
  const rejected=guard(req,'GET');if(rejected)return rejected;
  const url=new URL(req.url), format=url.searchParams.get('format')||defaultFormat;
  if(!['clubs','verified','cities','geojson'].includes(format))return response(req,{ok:false,error:'format'},400);
  const {data,error}=await client.rpc('bookish_visibility_directory');
  if(error||!Array.isArray(data))return response(req,{ok:false,error:'unavailable'},503);
  const q=(url.searchParams.get('q')||'').slice(0,100).toLowerCase();
  const clubs=data.filter(c=>c.visibility==='open'||c.visibility==='private').filter(c=>!q||`${c.name} ${c.city} ${c.state} ${(c.genres||[]).join(' ')}`.toLowerCase().includes(q));
  if(format==='clubs')return response(req,{ok:true,clubs});
  if(format==='verified')return response(req,{ok:true,clubs:clubs.filter(c=>c.verified).map(c=>({...c,listed:true,kind:'start'}))});
  const groups=new Map<string,any>();
  for(const c of clubs){
   if(!c.city||!c.state)continue;
   const u=`${slug(c.city)}-${c.state.toLowerCase()}`;
   if(!groups.has(u))groups.set(u,{n:c.city,s:c.state,u,c:0,v:0,g:{},vg:{},gp:[],la:c.lat,lo:c.lng,top:[],topv:[]});
   const city=groups.get(u);city.c++;if(c.verified)city.v++;
   (c.verified?city.topv:city.top).push(c.name);
   for(const genre of c.genres||[]){city.g[genre]=(city.g[genre]||0)+1;if(c.verified)city.vg[genre]=(city.vg[genre]||0)+1;}
  }
  const cities=[...groups.values()];
  if(format==='cities')return response(req,cities.map(({top,topv,...c})=>c));
  return response(req,{type:'FeatureCollection',features:cities.filter(c=>c.la!=null&&c.lo!=null).map(c=>({type:'Feature',geometry:{type:'Point',coordinates:[c.lo,c.la]},properties:{n:c.c,v:c.v,c:`${c.n}, ${c.s}`,u:c.u,top:c.top.slice(0,5).join('\u001f'),topv:c.topv.slice(0,5).join('\u001f')}}))});
 };
}
export function hostHandler(client:Client, notify?:(notice:any)=>Promise<boolean>){
 return async(req:Request)=>{
  const rejected=guard(req,'POST');if(rejected)return rejected;
  const token=(req.headers.get('authorization')||'').replace(/^Bearer /,'');
  if(!uuid.test(token))return response(req,{ok:false,error:'host_link'},403);
  let b;try{b=await body(req);}catch(e){return badBody(req,e);}
  const ref=clean(b.club_id,80),action=clean(b.action,10);
  if(!ref||!['get','save','rotate','decide'].includes(action))return response(req,{ok:false,error:'action'},400);
  if(action==='save'&&!['open','private','hidden'].includes(b.visibility))return response(req,{ok:false,error:'visibility'},400);
  if(action==='decide'&&(!uuid.test(b.request_id)||typeof b.approve!=='boolean'))return response(req,{ok:false,error:'request'},400);
  const {data,error}=await client.rpc('bookish_visibility_host',{p_token:token,p_action:action,p_ref:ref,p_visibility:b.visibility??null,p_request:b.request_id??null,p_approve:b.approve??null});
  if(error||!data)return response(req,{ok:false,error:'host_link'},403);
  const {notice,...publicResult}=data;
  if(notice&&notify)try{await notify(notice);}catch{/* decision is already saved */}
  return response(req,publicResult);
 };
}
export function joinHandler(client:Client, notify?:(notice:any)=>Promise<boolean>){
 return async(req:Request)=>{
  const rejected=guard(req,'POST');if(rejected)return rejected;
  let b;try{b=await body(req);}catch(e){return badBody(req,e);}
  if(clean(b.website,200)||!Number.isFinite(b.elapsed_ms)||b.elapsed_ms<2500)return response(req,{ok:true,status:'pending'});
  const email=clean(b.email,254).toLowerCase();
  if(!/^[^\s@<>()",;:]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/.test(email))return response(req,{ok:false,error:'email'},400);
  if(b.consent!==true)return response(req,{ok:false,error:'consent'},400);
  const note=clean(b.note,500);if(/https?:\/\/|www\./i.test(note))return response(req,{ok:false,error:'links_not_allowed'},400);
  const ip=(req.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim();
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`bookish:${ip}`));
  const ipHash=[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');
  const {data,error}=await client.rpc('bookish_visibility_join',{p_ref:clean(b.club_id,80),p_email:email,p_name:clean(b.first_name,60),p_note:note,p_code:clean(b.invite_code,12).toUpperCase(),p_ip:ipHash});
  if(error||!data)return response(req,{ok:false,error:'unavailable'},503);
  const {notice,...publicResult}=data;
  if(notice&&notify)try{publicResult[notice.kind==='request'?'host_notified':'member_notified']=await notify(notice);}catch{publicResult[notice.kind==='request'?'host_notified':'member_notified']=false;}
  return response(req,publicResult,data.ok?200:data.error==='rate_limited'?429:404);
 };
}
