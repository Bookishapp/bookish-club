// Existing emailed approval capabilities also obey the current visibility.
import {sb,SITE_URL} from '../_shared/bookish.ts';
import {clubNotice} from '../_shared/club-notice.ts';
Deno.serve(async req=>{
 const url=new URL(req.url),token=url.searchParams.get('token')||'', action=url.searchParams.get('action');
 let result='invalid';
 if(req.method==='GET'&&/^[a-f\d-]{36}$/i.test(token)&&['approve','decline'].includes(action||'')){
  const {data,error}=await sb.rpc('bookish_visibility_decide',{p_token:token,p_approve:action==='approve'});
  if(!error&&data?.ok){result=data.status;if(data.notice)try{await clubNotice(data.notice);}catch{/* saved decision remains valid */}}
 }
 return new Response(null,{status:302,headers:{location:`${SITE_URL}/join/done/?result=${result}`,'cache-control':'no-store','referrer-policy':'no-referrer'}});
});
