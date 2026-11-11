// Build only the local test harness. No hosted API request is needed.
import { build } from 'vite';
import fs from 'node:fs';
const root=new URL('../',import.meta.url).pathname;
const result=await build({root,configFile:false,logLevel:'silent',build:{write:false,minify:false,lib:{entry:new URL('../src/community.ts',import.meta.url).pathname,name:'UI',formats:['iife']}}});
const output=(Array.isArray(result)?result[0]:result).output;
const fixture=fs.readFileSync(new URL('./fixtures.mjs',import.meta.url),'utf8');
const js=output.find(x=>x.type==='chunk').code+'\n'+fixture.replaceAll('export ','')+`\nconst api=createFixtureAPI({role:'host'});window.testAPI=api;window.ui=UI.community;window.fetch=async(url,o={})=>{const data=await api.respond(url,o.body?JSON.parse(o.body):{},o.method);return{ok:true,status:200,text:async()=>JSON.stringify(data)};};ui.init(()=>{},()=>{});document.addEventListener('click',e=>{const b=e.target.closest('button');if(b)void ui.click(b);});document.addEventListener('submit',e=>{e.preventDefault();void ui.submit(e.target);});ui.join('our-club');`;
const css=['styles.css','community.css','tea.css','v3.css'].map(f=>fs.readFileSync(new URL('../src/'+f,import.meta.url),'utf8')).join('\n');
fs.writeFileSync(process.argv[2],JSON.stringify({js,css}));
