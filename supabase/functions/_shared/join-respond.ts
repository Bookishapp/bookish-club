import type { ClubNotice } from './types.ts';
type Decision = {ok?:boolean;status?:string;notice?:ClubNotice};
type Dependencies = {
 decide:(token:string,approve:boolean)=>PromiseLike<{data:Decision|null;error:unknown}>;
 notify:(notice:ClubNotice)=>Promise<unknown>;
 siteUrl:()=>Promise<string>;
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers={'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','x-frame-options':'DENY'};
const message=(text:string,status:number)=>new Response(text,{status,headers:{...headers,'content-type':'text/plain; charset=utf-8'}});
export function joinRespondHandler(deps:Dependencies){
 return async(req:Request):Promise<Response>=>{
  if(!['GET','POST'].includes(req.method))return message('Open the link from your email to continue.',405);
  try{
   const site=(await deps.siteUrl()).replace(/\/$/,'');
   if(req.method==='GET'){
    const url=new URL(req.url),token=url.searchParams.get('token')||'',action=url.searchParams.get('action');
    if(!uuid.test(token)||!['approve','decline'].includes(action||''))return message('This request link is unavailable.',400);
    // Supabase's project gateway rewrites GET HTML to plain text. The website
    // renders the confirmation, with capabilities kept in a no-referrer fragment.
    return new Response(null,{status:302,headers:{...headers,location:`${site}/join/confirm/#token=${token}&action=${action}`}});
   }
   // The website's native form POST needs no CORS or third-party cookies.
   // Origin prevents other websites from submitting a decision in the browser.
   if(req.headers.get('origin')!==new URL(site).origin)return message('Open the link from your email to continue.',403);
   if(req.headers.get('content-type')?.split(';')[0].trim()!=='application/x-www-form-urlencoded')return message('Open the link from your email to continue.',415);
   const body=await req.text();if(body.length>2048)return message('This request is unavailable.',413);
   const form=new URLSearchParams(body),token=form.get('token')||'',action=form.get('action');
   if(['token','action','confirm'].some(key=>form.getAll(key).length!==1)||!uuid.test(token)||!['approve','decline'].includes(action||'')||form.get('confirm')!=='yes')return message('This request is unavailable.',400);
   const {data,error}=await deps.decide(token,action==='approve');
   if(error)return message('This request could not be updated. Please try again soon.',503);
   if(!data?.ok||!['approved','declined'].includes(data.status||''))return message('This request has already been handled or is unavailable.',400);
   if(data.notice)try{await deps.notify(data.notice);}catch{/* The saved decision remains valid. */}
   return new Response(null,{status:303,headers:{...headers,location:`${site}/join/done/?result=${data.status}`}});
  }catch{return message('This request could not be updated. Please try again soon.',503);}
 };
}
