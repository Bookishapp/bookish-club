type Report={id:string;kind:string;target_id:string;club_id:string|null;reason:string|null;due_at:string};
type Dependencies={
 key:()=>Promise<string|undefined>;
 queue:(after:string|null)=>PromiseLike<{data:Report[]|null;error:unknown}>;
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function equalKey(a:string,b:string){
 const [x,y]=await Promise.all([a,b].map(s=>crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))));
 const left=new Uint8Array(x),right=new Uint8Array(y);let diff=0;
 for(let i=0;i<left.length;i++)diff|=left[i]^right[i];
 return diff===0;
}
export function reportAlertsHandler(deps:Dependencies){
 return async(req:Request):Promise<Response>=>{
  const reply=(status:number,body:unknown)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
  if(req.method!=='POST')return reply(405,{ok:false});
  try{
   const key=await deps.key();if(!key||key.length<32)return reply(503,{ok:false});
   const supplied=req.headers.get('x-bookish-worker-key')||'';
   if(!supplied||supplied.length>256||!await equalKey(key,supplied))return reply(401,{ok:false});
   const text=await req.text();if(text.length>1024)return reply(413,{ok:false});
   let body;try{body=JSON.parse(text);}catch{return reply(400,{ok:false});}
   if(!body||Array.isArray(body)||body.action!=='pending'||(body.after!=null&&(typeof body.after!=='string'||!uuid.test(body.after))))return reply(400,{ok:false});
   const {data,error}=await deps.queue(body.after||null);
   if(error||!Array.isArray(data))return reply(503,{ok:false});
   const reports=data.map(({id,kind,target_id,club_id,reason,due_at})=>({id,kind,target_id,club_id,reason,due_at}));
   return reply(200,{ok:true,reports,next:reports.length===100?reports.at(-1)!.id:null});
  }catch{return reply(503,{ok:false});}
 };
}
