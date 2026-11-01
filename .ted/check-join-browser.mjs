// Local-only two-origin Chrome verification. Never touches hosted records.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {joinRespondHandler} from '../supabase/functions/_shared/join-respond.ts';
const port=4347,site=`http://localhost:${port}`,api=`http://127.0.0.1:${port}`;
const evidence={fixture_only:true,decisions:[],posts:[],gets:0};
const save=()=>fs.writeFile(new URL('./JOIN-CONFIRM-BROWSER.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');
const handler=joinRespondHandler({siteUrl:async()=>site,notify:async()=>true,decide:async(token,approve)=>{
 evidence.decisions.push({token,approve});await save();return {data:{ok:true,status:approve?'approved':'declined'},error:null};
}});
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,`http://${req.headers.host}`);
 if(url.pathname==='/functions/v1/bookish-join-respond'){
  if(req.method==='GET'){evidence.gets++;await save();}
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const body=Buffer.concat(chunks).toString();
  const response=await handler(new Request(url,{method:req.method,headers:req.headers,...(body?{body}:{})}));
  if(req.method==='POST'){evidence.posts.push({origin:req.headers.origin||null,status:response.status});await save();}
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
 }
 if(url.pathname.startsWith('/functions/')){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ok:true,clubs:[]}));return;}
 try{
  const file=path.resolve('dist','.'+url.pathname+(url.pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(path.resolve('dist')+path.sep))throw Error('path');
  let body=await fs.readFile(file);
  const type=path.extname(file);if(type==='.html')body=Buffer.from(body.toString().replaceAll('https://tkrsrnlasinmlftkcufi.supabase.co',api));
  res.writeHead(200,{'content-type':type==='.html'?'text/html':type==='.js'?'text/javascript':'application/octet-stream'});res.end(body);
 }catch{res.writeHead(404);res.end('Not found');}
});
await save();server.listen(port,'0.0.0.0',()=>console.log(`Local test ready: ${api}/functions/v1/bookish-join-respond?token=12345678-1234-4234-8234-123456789abc&action=approve`));
