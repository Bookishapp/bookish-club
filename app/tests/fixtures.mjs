// Local review fixtures. Intercept every Supabase request with this handler.
// No fixtures or demo credentials are compiled into the production application.
export const ids={club:'10000000-0000-4000-8000-000000000001',reader:'20000000-0000-4000-8000-000000000001',other:'20000000-0000-4000-8000-000000000002',request:'30000000-0000-4000-8000-000000000001',meeting:'40000000-0000-4000-8000-000000000001',vote:'50000000-0000-4000-8000-000000000001',one:'60000000-0000-4000-8000-000000000001',two:'60000000-0000-4000-8000-000000000002'};
export const fixtureClub={id:ids.club,name:'The After Hours Readers',city:'Chicago',state:'IL',genres:['Literary fiction','Mystery'],vibe:'Good books, warm company, and one more chapter.',cadence:'The first Thursday of each month',format:'In person',source_name:null,source_url:null,last_seen:'2026-11-01',lat:41.88,lng:-87.63,verified:true,visibility:'private',current_book:{title:'The Midnight Library',authors:['Matt Haig']}};
export function createFixtureAPI({role='host',member=true,counts=[3,2]}={}){
 const calls=[],failures=new Set();let accepted=false,joined=member,deleted=false,pending=true,choice=null,filters=[],club={...fixtureClub},current={id:'the-midnight-library',title:'The Midnight Library',authors:['Matt Haig']};
 let closed=false;const meetings=[{id:ids.meeting,title:'A cozy November chapter',starts_at:'2026-11-12T02:00:00Z',location:'The reading room at our neighborhood library',status:'scheduled',bring_items:[],rsvps:[]}];
 const bookOptions=[{option_id:ids.one,book_id:'the-midnight-library',ballots:counts[0]},{option_id:ids.two,book_id:'yellowface',ballots:counts[1]}];
 return {calls,failNext(name){failures.add(name);},async respond(url,body={},method='GET'){
  calls.push({url,body,method});const suffix=new URL(url,'https://localhost').pathname.split('/').pop();if(failures.delete(suffix))return{$status:401,ok:false};const path=new URL(url,'https://localhost').pathname;
  if(path.endsWith('/bookish-auth')){if(body.action==='start'||body.action==='logout')return{ok:true};return{ok:true,public_key:'local-public-fixture',session:{access_token:'local-access-fixture',refresh_token:'local-refresh-fixture',expires_in:3600,user:{id:ids.reader,email:body.email||'reviewer@example.test'}}};}
  if(path.endsWith('/bookish-delete-account')){deleted=true;return{ok:true};}
  if(path.endsWith('/bookish-directory'))return{ok:true,clubs:filters.some(f=>f.kind==='club')?[]:[{...club,id:'after-hours-chicago',club_id:ids.club}]};
  if(path.endsWith('/bookish-community'))return{national:[],city:[],state:[],next:[]};
  if(path.includes('/bookish_profiles'))return null;
  const rpc=path.split('/').pop();
  if(rpc==='bookish_my_account')return deleted?null:{id:ids.reader,display_name:'Alex',home_city:'Chicago',terms_version:accepted?'2026-10-15':null,adult_confirmed:accepted,terms_accepted_at:accepted?'2026-11-01T19:00:00Z':null};
  if(rpc==='bookish_accept_terms'){accepted=true;return null;}
  if(rpc==='bookish_my_clubs')return joined&&!filters.some(f=>f.kind==='club')?[{...club,role}]:[];
  if(rpc==='bookish_my_content_filters')return filters;
  if(rpc==='bookish_club_home')return {club,role,current_book:current,members:[{user_id:ids.reader,role,display_name:'Alex',joined_at:'2026-10-20'},{user_id:ids.other,role:'member',display_name:'Jamie',joined_at:'2026-10-22'}],meetings,votes:[{id:ids.vote,closes_at:'2026-11-10T23:59:00Z',status:closed?'closed':'open'}]};
  if(rpc==='bookish_join_queue')return pending?[{id:ids.request,user_id:ids.other,first_name:'Jamie',note:'I love a good mystery and a lively discussion. I would love to read with you.',created_at:'2026-11-01T20:00:00Z'}]:[];
  if(rpc==='bookish_vote_tally')return bookOptions.map(o=>({...o,ballots:o.ballots+(choice===o.option_id?1:0)}));
  if(rpc==='bookish_my_vote')return choice;
  if(rpc==='bookish_cast_ballot'){choice=body.p_option;return null;}
  if(rpc==='bookish_decide_join'){pending=false;return null;}
  if(rpc==='bookish_join_club'||rpc==='bookish-account-join'){if(club.visibility==='open'){joined=true;return{club_id:ids.club,status:'joined'};}return{club_id:ids.club,status:'pending'};}
  if(rpc==='bookish_redeem_invite'){joined=true;return ids.club;}
  if(rpc==='bookish_create_club'){joined=true;club={...club,name:body.p_name,city:body.p_city,state:body.p_state};return ids.club;}
  if(rpc==='bookish_set_club_city'){club.city=body.p_city;club.state=body.p_state;return null;}
  if(rpc==='bookish_set_visibility'){club.visibility=body.p_visibility;return null;}
  if(rpc==='bookish_rotate_invite')return 'READTOGETHER';
  if(rpc==='bookish_set_current_book'){current={id:body.p_book,title:body.p_book==='yellowface'?'Yellowface':body.p_book,authors:[]};return null;}
  if(rpc==='bookish_content_action'){filters.push({kind:body.p_kind,id:body.p_id});return null;}
  if(rpc==='bookish_schedule_meeting'){meetings.push({id:ids.meeting,title:body.p_title,starts_at:body.p_starts,location:body.p_location,status:'scheduled'});return ids.meeting;}
  if(rpc==='bookish_close_vote'){closed=true;return body.p_winner||ids.one;}
  if(rpc==='bookish_open_vote')return ids.vote;
  throw Error(`Unmocked fixture request: ${method} ${path}`);
 }};
}
