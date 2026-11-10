// Local review fixtures. Intercept every Supabase request with this handler.
// No fixtures or demo credentials are compiled into the production application.
export const ids={club:'10000000-0000-4000-8000-000000000001',reader:'20000000-0000-4000-8000-000000000001',other:'20000000-0000-4000-8000-000000000002',request:'30000000-0000-4000-8000-000000000001',meeting:'40000000-0000-4000-8000-000000000001',vote:'50000000-0000-4000-8000-000000000001',one:'60000000-0000-4000-8000-000000000001',two:'60000000-0000-4000-8000-000000000002'};
export const fixtureClub={id:ids.club,name:'The After Hours Readers',city:'Chicago',state:'IL',genres:['Literary fiction','Mystery'],vibe:'Good books, warm company, and one more chapter.',cadence:'The first Thursday of each month',format:'In person',source_name:null,source_url:null,last_seen:'2026-11-01',lat:41.88,lng:-87.63,verified:true,visibility:'private',current_book:{title:'The Midnight Library',authors:['Matt Haig']}};
export function createFixtureAPI({role='host',member=true,counts=[3,2]}={}){
 const calls=[],failures=new Set();let accepted=false,joined=member,deleted=false,pending=true,choice=null,filters=[],club={...fixtureClub},current={id:'the-midnight-library',title:'The Midnight Library',authors:['Matt Haig'],pages:498};
 let closed=false,winner=null,sharing=false,myPage=212,finished=false,dnf=false,reminders=true,rsvp=null;
 const takes=[{id:'70000000-0000-4000-8000-000000000001',parent_id:null,body:'I had to put the book down and walk a lap. What a chapter.',page:180,did_not_finish:false,sealed:false,sips:6,sipped:false,reply_count:1,created_at:'2026-11-06T12:00:00Z'},{id:'70000000-0000-4000-8000-000000000002',parent_id:null,body:null,page:388,did_not_finish:false,sealed:true,sips:4,sipped:false,reply_count:2,created_at:'2026-11-06T11:00:00Z'}];
 const notices=[{id:'80000000-0000-4000-8000-000000000001',club_id:ids.club,kind:'new_take',target_id:takes[0].id,created_at:'2026-11-06T12:00:00Z',read_at:null},{id:'80000000-0000-4000-8000-000000000002',club_id:ids.club,kind:'meeting_reminder',target_id:ids.meeting,created_at:'2026-11-05T12:00:00Z',read_at:null}];
 const bring=[{id:'90000000-0000-4000-8000-000000000001',label:'Salty snacks',claimed:false,claimed_by:null,display_name:null},{id:'90000000-0000-4000-8000-000000000002',label:'Something sweet',claimed:true,claimed_by:null,display_name:null}];const meetings=[{id:ids.meeting,title:'A cozy November chapter',starts_at:'2026-11-12T02:00:00Z',location:'The reading room at our neighborhood library',status:'scheduled',bring_items:[],rsvps:[]}];
 const bookOptions=[{option_id:ids.one,book_id:'the-midnight-library',ballots:counts[0]},{option_id:ids.two,book_id:'yellowface',ballots:counts[1]}];
 return {calls,failNext(name){failures.add(name);},async respond(url,body={},method='GET'){
  calls.push({url,body,method});const suffix=new URL(url,'https://localhost').pathname.split('/').pop();if(failures.delete(suffix))return{$status:401,ok:false};const path=new URL(url,'https://localhost').pathname;
  if(path.endsWith('/bookish-auth')){if(body.action==='start'||body.action==='logout')return{ok:true};return{ok:true,public_key:'local-public-fixture',session:{access_token:'local-access-fixture',refresh_token:'local-refresh-fixture',expires_in:3600,user:{id:ids.reader,email:body.email||'reviewer@example.test'}}};}
  if(path.endsWith('/bookish-delete-account')){deleted=true;return{ok:true};}
  if(path.endsWith('/bookish-directory'))return{ok:true,clubs:filters.some(f=>f.kind==='club')?[]:[{...club,id:'after-hours-chicago',club_id:ids.club}]};
  if(path.endsWith('/bookish-community'))return{national:[],city:[],state:[],next:[]};
  if(path.includes('/bookish_profiles'))return null;
  if(path.includes('/bookish_members'))return [{meeting_reminders:reminders}];
  if(path.endsWith('/bookish-meeting-calendar'))return 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n';
  const rpc=path.split('/').pop();
  if(rpc==='bookish_reading_together')return{book:current,my_page:myPage,my_finished:finished,my_did_not_finish:dnf,sharing,meeting_mark:260,members:[{user_id:ids.other,display_name:'Jamie',page:64,finished:false},...(sharing?[{user_id:ids.reader,display_name:'Alex',page:myPage,finished}]:[])]};
  if(rpc==='bookish_tea_feed'){const rows=body.p_parent?[...(body.p_parent==='70000000-0000-4000-8000-000000000001'?[{...takes.find(t=>t.id===body.p_parent),id:'70000000-0000-4000-8000-000000000003',parent_id:body.p_parent,page:180,body:'I went back and reread it twice. For research, obviously.',reply_count:0}]:[]),...takes.filter(t=>t.parent_id===body.p_parent)]:takes.filter(t=>t.parent_id===null);return rows.slice(body.p_offset||0,(body.p_offset||0)+(body.p_limit||30));}
  if(rpc==='bookish_create_take'){if(body.p_parent){const parent=takes.find(t=>t.id===body.p_parent);if(parent)parent.reply_count++;}const id='70000000-0000-4000-8000-'+String(takes.length+10).padStart(12,'0');takes.unshift({id,parent_id:body.p_parent,body:body.p_body,page:body.p_page,did_not_finish:body.p_dnf,sealed:false,sips:0,sipped:false,reply_count:0,created_at:new Date().toISOString()});return{id,status:'posted'};}
  if(rpc==='bookish_sip'){const take=takes.find(t=>t.id===body.p_take);if(take){take.sips+=body.p_sip===take.sipped?0:body.p_sip?1:-1;take.sipped=body.p_sip;}return null;}
  if(rpc==='bookish_log_reading'){myPage=body.p_page;finished=body.p_finished;dnf=body.p_dnf;return ids.one;}
  if(rpc==='bookish_share_reading'){sharing=body.p_share;return null;}
  if(rpc==='bookish_notifications')return notices.slice(body.p_offset||0,(body.p_offset||0)+(body.p_limit||50));
  if(rpc==='bookish_mark_notifications_read'){for(const n of notices)if(!body.p_id||n.id===body.p_id)n.read_at=new Date().toISOString();return null;}
  if(rpc==='bookish_reminder_preferences'){reminders=body.p_enabled;return null;}
  if(rpc==='bookish_meeting_detail')return{...meetings.find(m=>m.id===body.p_meeting),counts:{yes:rsvp==='yes'?4:3,maybe:2,cant:1},my_rsvp:rsvp,bring_items:bring};
  if(rpc==='bookish_rsvp'){rsvp=body.p_response;return null;}
  if(rpc==='bookish_claim_bring_item'){const item=bring.find(i=>i.id===body.p_item);if(item.claimed&&item.claimed_by!==ids.reader)return{$status:409,ok:false};item.claimed=body.p_claim;item.claimed_by=body.p_claim?ids.reader:null;item.display_name=body.p_claim?'Alex':null;return null;}
  if(rpc==='bookish_add_bring_item'){bring.push({id:ids.two,label:body.p_label,claimed:false,claimed_by:null,display_name:null});return ids.two;}
  if(rpc==='bookish_edit_meeting'){Object.assign(meetings.find(m=>m.id===body.p_meeting),{title:body.p_title,starts_at:body.p_starts,location:body.p_location,stop_page:body.p_stop,status:body.p_cancel?'cancelled':'scheduled'});return null;}
  if(rpc==='bookish_host_reports')return[{report_id:ids.request,take_id:takes[1].id,body:null,reason:'Unkind language',due_at:'2026-11-07T12:00:00Z',host_status:'pending',review_status:'pending'}];
  if(rpc==='bookish_moderate_take')return null;
  if(rpc==='bookish_message_card')return body.p_kind==='take'?{kind:'take',id:body.p_id,page:180,did_not_finish:false,sealed:true,label:'Anonymous',book:{id:current.id,title:current.title,cover_url:null}}:body.p_kind==='meeting'?{kind:'meeting',id:body.p_id,title:meetings[0].title,starts_at:meetings[0].starts_at,status:'scheduled',counts:{yes:3,maybe:2,cant:1},open_items:[{id:bring[0].id,label:bring[0].label}]}:{kind:'vote',id:body.p_id,status:'open',closes_at:'2026-11-10T23:59:00Z',options:bookOptions};
  if(rpc==='bookish_my_account')return deleted?null:{id:ids.reader,display_name:'Alex',home_city:'Chicago',terms_version:accepted?'2026-10-15':null,adult_confirmed:accepted,terms_accepted_at:accepted?'2026-11-01T19:00:00Z':null};
  if(rpc==='bookish_accept_terms'){accepted=true;return null;}
  if(rpc==='bookish_my_clubs')return joined&&!filters.some(f=>f.kind==='club')?[{...club,role}]:[];
  if(rpc==='bookish_my_content_filters')return filters;
  if(rpc==='bookish_club_home')return {club,role,current_book:current,members:[{user_id:ids.reader,role,display_name:'Alex',joined_at:'2026-10-20'},{user_id:ids.other,role:'member',display_name:'Jamie',joined_at:'2026-10-22'}],meetings,votes:[{id:ids.vote,closes_at:'2026-11-10T23:59:00Z',status:closed?'closed':'open',winner_option:winner}]};
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
  if(rpc==='bookish_close_vote'){
   if(closed)return winner;
   const top=Math.max(...bookOptions.map(o=>o.ballots+(choice===o.option_id?1:0)));
   const leaders=bookOptions.filter(o=>o.ballots+(choice===o.option_id?1:0)===top);
   if(!body.p_winner&&leaders.length!==1)return{$status:400,ok:false};
   const selected=leaders.find(o=>o.option_id===(body.p_winner||leaders[0].option_id));
   if(!selected)return{$status:400,ok:false};
   closed=true;winner=selected.option_id;
   current={id:selected.book_id,title:selected.book_id==='yellowface'?'Yellowface':'The Midnight Library',authors:[selected.book_id==='yellowface'?'R. F. Kuang':'Matt Haig']};
   return winner;
  }
  if(rpc==='bookish_open_vote')return ids.vote;
  throw Error(`Unmocked fixture request: ${method} ${path}`);
 }};
}
