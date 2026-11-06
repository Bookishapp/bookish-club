import {test} from 'node:test';
import assert from 'node:assert/strict';
import {remindersHandler,calendarHandler,meetingIcs} from '../../supabase/functions/_shared/meeting-reminders.ts';
const id='93000000-0000-4000-8000-000000000001',lease='93000000-0000-4000-8000-000000000002',meeting='93000000-0000-4000-8000-000000000003',key='fixture-reminder-worker-key-long-enough';
const row={id,lease,meeting_id:meeting,email:'reader@example.test',title:'Club night',starts_at:'2027-01-02T20:00:00Z',location:'123 Fiction Lane 📖',calendar_generated_at:'2026-11-05T22:00:00Z'};
const req=(secret=key,method='POST',body={action:'run'})=>new Request('https://local.test/reminders',{method,headers:{'x-bookish-worker-key':secret},...(method==='POST'?{body:JSON.stringify(body)}:{})});
function fixture(options={}){
 const calls=[];const deps={key:async()=>key,config:async()=>({from:'Bookish <hello@example.test>',resendKey:'fake-resend'}),claim:async()=>[row],prepare:async()=>row,complete:async(...a)=>calls.push(['complete',...a]),fetcher:async(url,init)=>{calls.push(['send',url,init]);return Response.json({id:'provider-id'});},...options};return {calls,handler:remindersHandler(deps)};
}
test('reminder worker authenticates before configuration, claiming, or sending',async()=>{
 let claimed=false;const {handler}=fixture({claim:async()=>{claimed=true;return [row];}});
 assert.equal((await handler(req('bad'))).status,401);assert.equal((await handler(req(key,'GET'))).status,405);assert.equal(claimed,false);
 assert.equal((await fixture({key:async()=>undefined}).handler(req())).status,503);
 assert.equal((await handler(req(key,'POST',{action:'send',email:'attacker@example.test'}))).status,400);
});
test('missing sender or Resend configuration fails closed before claiming',async()=>{
 let claimed=false;const {handler}=fixture({config:async()=>null,claim:async()=>{claimed=true;return [row];}});assert.equal((await handler(req())).status,503);assert.equal(claimed,false);
});
test('worker uses stable provider idempotency, BOOKISH_EMAIL_FROM, an ICS attachment, and safe responses',async()=>{
 const {handler,calls}=fixture();const response=await handler(req());assert.equal(response.status,200);assert.ok(response.headers.get('cache-control').includes('no-store'));const result=await response.json();assert.deepEqual(result,{ok:true,sent:1,skipped:0,failed:0});
 const [,url,init]=calls[0];assert.equal(url,'https://api.resend.com/emails');assert.equal(init.headers['Idempotency-Key'],`bookish-meeting-reminder/${id}`);const payload=JSON.parse(init.body);assert.equal(payload.from,'Bookish <hello@example.test>');assert.deepEqual(payload.to,['reader@example.test']);assert.equal(payload.subject,'Your Bookish meeting is coming up');assert.ok(payload.text.includes('Calendar invite attached'));assert.ok(!/bearer|session|https?:|UTC|tomorrow/i.test(payload.text));assert.equal(payload.attachments.length,1);assert.equal(payload.attachments[0].filename,`bookish-${meeting}.ics`);const ics=Buffer.from(payload.attachments[0].content,'base64').toString('utf8');assert.ok(ics.includes('BEGIN:VCALENDAR'));assert.ok(ics.includes('LOCATION:123 Fiction Lane 📖'));assert.ok(ics.includes('DTSTART:20270102T200000Z'));assert.ok(payload.text.includes('club settings'));assert.deepEqual(calls[1],['complete',id,lease]);assert.ok(!JSON.stringify(result).includes('reader@example.test'));
});
test('revoked eligibility skips sending, provider failures stay unacknowledged, and acknowledgments may retry with the same key',async()=>{
 const revoked=fixture({prepare:async()=>null});assert.equal((await(await revoked.handler(req())).json()).skipped,1);assert.equal(revoked.calls.length,0);
 const failed=fixture({fetcher:async()=>new Response('private provider error',{status:500})});const response=await failed.handler(req());assert.equal(response.status,503);assert.equal(failed.calls.length,0);assert.ok(!(await response.text()).includes('private provider error'));
 const ack=fixture({complete:async()=>{throw Error('private database error');}});assert.equal((await ack.handler(req())).status,503);await ack.handler(req());assert.equal(ack.calls[0][2].headers['Idempotency-Key'],ack.calls[1][2].headers['Idempotency-Key']);assert.equal(ack.calls[0][2].body,ack.calls[1][2].body);
});
test('calendar output escapes content, folds UTF-8 lines, and includes a stable UID without an attendee',()=>{
 const before=Date.now();const ics=meetingIcs({id:meeting,title:'A;book,\nINJECT:evil '+'📖'.repeat(80),starts_at:'2027-01-02T20:00:00Z',location:'123 Fiction Lane\\Second floor'});
 assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));assert.ok(ics.includes(`UID:${meeting}@meetbookish.com`));assert.ok(ics.includes('DTSTART:20270102T200000Z'));assert.ok(ics.includes('DURATION:PT2H'));const stamp=/DTSTAMP:(\d{8}T\d{6}Z)/.exec(ics)?.[1];assert.ok(stamp);const stampTime=Date.parse(stamp.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/,'$1-$2-$3T$4:$5:$6Z'));assert.ok(stampTime>=before-1000&&stampTime<=Date.now());assert.ok(ics.includes('SUMMARY:A\\;book\\,\\nINJECT:evil'));assert.ok(!ics.includes('\r\nINJECT:'));assert.ok(!ics.includes('ATTENDEE'));for(const line of ics.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75);
});
test('calendar endpoint requires a verified Bookish member RPC and has private download headers',async()=>{
 let called=false;const handler=calendarHandler({getUser:async token=>token==='member'?{app_metadata:{app:'bookish'},email_confirmed_at:'now'}:null,calendar:async(token,mid)=>{called=true;assert.equal(token,'member');assert.equal(mid,meeting);return {id:meeting,title:'Club night',starts_at:'2027-01-02T20:00:00Z',location:'PRIVATE VENUE'};}});
 const url=`https://local.test/calendar?meeting=${meeting}`;assert.equal((await handler(new Request(url))).status,401);assert.equal(called,false);
 const res=await handler(new Request(url,{headers:{authorization:'Bearer member'}}));assert.equal(res.status,200);assert.equal(res.headers.get('content-type'),'text/calendar; charset=utf-8');assert.ok(res.headers.get('cache-control').includes('no-store'));assert.ok(res.headers.get('content-disposition').includes('.ics'));assert.ok((await res.text()).includes('PRIVATE VENUE'));
 const denied=calendarHandler({getUser:async()=>({app_metadata:{app:'bookish'},email_confirmed_at:'now'}),calendar:async()=>{throw Error('Membership required');}});assert.equal((await denied(new Request(url,{headers:{authorization:'Bearer member'}}))).status,404);
});
test('calendar downloads support authenticated native and website CORS preflights',async()=>{
 const handler=calendarHandler({getUser:async()=>null,calendar:async()=>{throw Error('Must not call');}});
 for(const origin of ['capacitor://localhost','https://meetbookish.com']){
  const response=await handler(new Request(`https://local.test/calendar?meeting=${meeting}`,{method:'OPTIONS',headers:{origin,'access-control-request-method':'GET','access-control-request-headers':'authorization'}}));
  assert.equal(response.status,204);assert.equal(response.headers.get('access-control-allow-origin'),origin);assert.ok(response.headers.get('access-control-allow-methods').includes('GET'));assert.ok(response.headers.get('access-control-allow-headers').includes('authorization'));
 }
});
