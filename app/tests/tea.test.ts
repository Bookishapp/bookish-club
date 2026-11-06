import test from 'node:test';
import assert from 'node:assert/strict';
import { takePayload, takeCard, ReadingRequest, messageLink } from '../src/tea.ts';
test('takes require exactly one valid page or DNF marker and a short body',()=>{
 assert.equal(takePayload('club','book',' A take ',0,false).p_page,0);
 assert.equal(takePayload('club','book','DNF thoughts',null,true).p_dnf,true);
 for(const page of [-1,NaN,1.5,null])assert.throws(()=>takePayload('c','b','Words',page,false));
 assert.throws(()=>takePayload('c','b','Words',12,true));
 assert.throws(()=>takePayload('c','b',' ',0,false));
 assert.throws(()=>takePayload('c','b','x'.repeat(281),0,false));
});
test('sealed take rendering never serializes body, identity, or a tap reveal',()=>{
 const card=takeCard({id:'take',parent_id:null,body:'SECRET NEVER RENDER',page:388,did_not_finish:false,sealed:true,sips:3,sipped:false,reply_count:2,created_at:''});
 assert.ok(!card.includes('SECRET'));assert.match(card,/Sealed until p. 388/);assert.ok(!card.includes('data-sip'));assert.ok(!card.includes('tap to reveal'));
});
test('unsealed takes escape content and expose one sip and reply controls',()=>{
 const card=takeCard({id:'take',parent_id:null,body:'<script>bad</script>',page:0,did_not_finish:false,sealed:false,sips:3,sipped:true,reply_count:2,created_at:''});
 assert.match(card,/&lt;script&gt;/);assert.match(card,/aria-pressed="true"/);assert.match(card,/data-thread="take"/);assert.ok(!card.includes('<script>'));
});
test('reading log retries reuse the request ID until the values change',()=>{
 const r=new ReadingRequest(()=> 'request-'+Math.random());const a=r.values('c','b',12,false,false);
 assert.deepEqual(r.values('c','b',12,false,false),a);assert.notEqual(r.values('c','b',13,false,false).p_request,a.p_request);
 assert.throws(()=>r.values('c','b',13,true,true));r.clear();assert.notEqual(r.values('c','b',12,false,false).p_request,a.p_request);
});
test('message links contain only kind and resource identity',()=>{
 const id='10000000-0000-4000-8000-000000000001';assert.equal(messageLink('take',id),'https://meetbookish.com/imessage/v2/take/'+id);assert.throws(()=>messageLink('take','bad?token=secret'));
});
