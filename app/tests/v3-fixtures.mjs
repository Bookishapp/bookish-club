// Local-only approved v3 review data. Never imported by the shipped application.
import { createFixtureAPI, ids } from './fixtures.mjs';
export { ids };
const uid=n=>n===3?ids.reader:`20000000-0000-4000-8000-${String(n+10).padStart(12,'0')}`;
const takeID=n=>`70000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const currentBook={id:'pride-and-prejudice',title:'Pride and Prejudice',authors:['Jane Austen'],pages:432,chapters:61,cover_id:null,cover_url:null,moods:['Classics']};
export const fixtureClub={id:ids.club,name:'Unhinged Annotators',created_at:'2026-03-01T12:00:00Z',city:'Austin',state:'TX',lat:30.2672,lng:-97.7431,genres:['Classics'],vibe:'Good books, good company, and unhinged annotations.',cadence:'Thursdays',format:'In person',verified:true,visibility:'private',host:'Jess',current_book:currentBook};
export const members=['Jess','Priya','Kat','Nina','Maya','Dee'].map((display_name,i)=>({user_id:uid(i),display_name,role:i===0?'host':i===1?'cohost':'member',joined_at:`2026-${String(i<4?3:i===4?5:6).padStart(2,'0')}-01`}));
const book=(id,title,author)=>({id,title,authors:[author],cover_id:null,cover_url:null,moods:['Classics']});
export const classics={
 'pride-and-prejudice':currentBook,
 emma:book('emma','Emma','Jane Austen'),
 'anne-of-green-gables':book('anne-of-green-gables','Anne of Green Gables','L. M. Montgomery'),
 'wuthering-heights':book('wuthering-heights','Wuthering Heights','Emily Brontë'),
 'north-and-south':book('north-and-south','North and South','Elizabeth Gaskell'),
 persuasion:book('persuasion','Persuasion','Jane Austen'),
 'jane-eyre':book('jane-eyre','Jane Eyre','Charlotte Brontë'),
 'the-secret-garden':book('the-secret-garden','The Secret Garden','Frances Hodgson Burnett'),
 'little-women':book('little-women','Little Women','Louisa May Alcott'),
 'sense-and-sensibility':book('sense-and-sensibility','Sense and Sensibility','Jane Austen'),
};
export const voteOptions=['emma','anne-of-green-gables','wuthering-heights','north-and-south'].map((book_id,i)=>({option_id:`60000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,book_id,ballots:4-i,book:classics[book_id],nominated_by:['Jess','Kat','Nina','Priya'][i],mean_hearts:i===0?4.6:null,recommended:i===0||i===2}));
export const directory=[['The Persuadables','open','Thursdays, members’ homes'],['The Slow Readers','private','First Sundays, rotating'],['Thursday Classics Circle','open','Public calendar']].map(([name,visibility,cadence],i)=>({...fixtureClub,id:`austin-v3-${i+1}`,club_id:i===1?ids.club:`10000000-0000-4000-8000-${String(i+2).padStart(12,'0')}`,name,visibility,cadence,verified:i!==2,source_name:i===2?'Public calendar':null,source_url:i===2?'https://example.test/austin-calendar':null,current_book:i===0?currentBook:classics['the-secret-garden']}));
const shelfRows=[['persuasion',4.7,'2026-09-30','Captain Wentworth’s letter. That’s the take.','Dee'],['jane-eyre',4.4,'2026-08-31','Rochester is a red flag and I’d still go to Thornfield.','Anonymous'],['the-secret-garden',4.1,'2026-07-31','Read it in the backyard. Felt like cheating.','Maya'],['little-women',4.5,'2026-06-30','A chapter for every kind of sister.','Priya'],['anne-of-green-gables',4.2,'2026-05-31','A little more scope for imagination.','Jess']];
export const libraryBooks=[{book:currentBook,status:'reading',started_at:'2026-10-01',finished_at:null,mean_hearts:4.3,rated_count:5,member_count:6,my_rating:null,favorite_take:null},...shelfRows.map(([id,mean_hearts,finished_at,body,attribution],i)=>({book:classics[id],status:'finished',started_at:finished_at.slice(0,7)+'-01',finished_at,mean_hearts,rated_count:6,member_count:6,my_rating:null,favorite_take:{id:takeID(i+50),body,attribution}}))];
export const recommendations=[['emma','persuasion',4.6,10],['wuthering-heights','jane-eyre',4.4,212],['sense-and-sensibility','little-women',4.5,183]].map(([id,because,mean_hearts,clubs])=>({book:classics[id],because_book:{id:because,title:classics[because].title},mean_hearts,clubs}));
export function createV3FixtureAPI({role='host',member=true,accepted=false}={}){
 const base=createFixtureAPI({role,member});const calls=[];let terms=accepted,sharing=true,myPage=247,rsvp='yes',reminders=true,pending=true,visibility='private',choice=voteOptions[0].option_id,ratings=structuredClone(libraryBooks);
 const takes=[
  {id:takeID(1),parent_id:null,body:'Mr. Collins proposing like he’s reading a grocery list. I had to put the book down and walk a lap.',page:198,did_not_finish:false,sealed:false,sips:31,sipped:false,reply_count:14,created_at:'2026-10-21T16:39:00Z'},
  {id:takeID(2),parent_id:null,body:null,page:288,did_not_finish:false,sealed:true,sips:9,sipped:false,reply_count:0,created_at:'2026-10-21T16:38:00Z'},
  {id:takeID(3),parent_id:null,body:'Theory: Charlotte knows exactly what she’s doing and she’s the smartest person in this book.',page:164,did_not_finish:false,sealed:false,sips:18,sipped:false,reply_count:6,created_at:'2026-10-21T16:37:00Z',display_name:'Kat'},
 ];
 const meeting={id:ids.meeting,club_id:ids.club,title:'Thursday at Jess’s',starts_at:'2026-10-23T00:30:00Z',location:'Jess’s place, Austin',status:'scheduled',stop_page:260,stop_chapter:30,bring_items:[],rsvps:[]};
 const bring=['A red and a white','Cheese board','Something sweet','Salty snacks'].map((label,i)=>({id:`90000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,label,claimed:i!==3,claimed_by:i===0?uid(0):i===1?uid(2):i===2?ids.reader:null,display_name:['Jess','Kat','Nina',null][i]}));
 const notices=['new_take','vote_opened','meeting_reminder','new_take','join_request'].map((kind,i)=>({id:`80000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,club_id:ids.club,kind,target_id:kind==='new_take'?takeID(1):kind==='vote_opened'?ids.vote:kind==='join_request'?ids.request:ids.meeting,created_at:['2026-10-21T16:39:00Z','2026-10-21T15:41:00Z','2026-10-21T13:41:00Z','2026-10-20T16:41:00Z','2026-10-19T16:41:00Z'][i],read_at:i>2?'2026-10-21T12:00:00Z':null}));
 return {calls,async respond(url,body={},method='GET'){
  calls.push({url,body,method});const pathname=new URL(url,'http://localhost').pathname,rpc=pathname.split('/').pop();
  if(rpc==='bookish-directory')return{ok:true,clubs:member?directory:[{...fixtureClub,id:'unhinged-annotators',club_id:ids.club,name:'Unhinged Annotators Society'}]};
  if(rpc==='bookish-community')return{national:[],city:[],state:[],next:[]};
  if(rpc==='bookish_my_account')return{id:ids.reader,display_name:'Nina',home_city:'Austin',terms_version:terms?'2026-10-15':null,adult_confirmed:terms,terms_accepted_at:terms?'2026-10-20T12:00:00Z':null};
  if(rpc==='bookish_accept_terms'){terms=true;return null;}
  if(rpc==='bookish_my_clubs')return member?[{...fixtureClub,visibility,role},{...fixtureClub,id:'10000000-0000-4000-8000-000000000009',name:'Work Book Club',role:'member'}]:[];
  if(rpc==='bookish_club_home')return{club:{...fixtureClub,visibility},role,current_book:currentBook,members,meetings:[meeting],votes:[{id:ids.vote,closes_at:'2026-10-26T02:00:00Z',status:'open'}]};
  if(rpc==='bookish_join_queue')return pending?[{id:ids.request,user_id:ids.other,first_name:'Lauren',note:'Austen person, will bring cookies.',created_at:'2026-10-19T16:41:00Z'}]:[];
  if(rpc==='bookish_decide_join'){pending=false;return null;}
  if(rpc==='bookish_vote_tally')return voteOptions;
  if(rpc==='bookish_my_vote')return choice;
  if(rpc==='bookish_cast_ballot'){choice=body.p_option;return null;}
  if(rpc==='bookish_reading_together')return{book:currentBook,my_page:myPage,my_finished:false,my_did_not_finish:false,sharing,meeting_mark:260,members:members.map((m,i)=>({user_id:m.user_id,display_name:m.display_name,page:[340,130,410,myPage,55,260][i],chapter:[48,18,58,34,8,36][i],finished:false}))};
  if(rpc==='bookish_tea_feed')return body.p_parent?[]:takes;
  if(rpc==='bookish_sip'){const t=takes.find(t=>t.id===body.p_take);if(t){t.sipped=body.p_sip;t.sips+=body.p_sip?1:-1;}return null;}
  if(rpc==='bookish_create_take'){takes.unshift({id:takeID(20),parent_id:body.p_parent,body:body.p_body,page:body.p_page,did_not_finish:body.p_dnf,sealed:false,sips:0,sipped:false,reply_count:0,created_at:'2026-10-21T16:41:00Z'});return takeID(20);}
  if(rpc==='bookish_log_reading'){myPage=body.p_page;return ids.one;}
  if(rpc==='bookish_share_reading'){sharing=body.p_share;return null;}
  if(rpc==='bookish_meeting_detail')return{...meeting,counts:{yes:4,maybe:1,cant:0},my_rsvp:rsvp,bring_items:bring};
  if(rpc==='bookish_rsvp'){rsvp=body.p_response;return null;}
  if(rpc==='bookish_notifications')return notices;
  if(rpc==='bookish_mark_notifications_read'){for(const n of notices)if(!body.p_id||n.id===body.p_id)n.read_at='2026-10-21T16:41:00Z';return null;}
  if(rpc==='bookish_reminder_preferences'){reminders=body.p_enabled;return null;}
  if(pathname.includes('/bookish_members'))return[{meeting_reminders:reminders}];
  if(rpc==='bookish_set_visibility'){visibility=body.p_visibility;return null;}
  if(rpc==='bookish_rotate_invite')return'ANNOTATE42';
  if(rpc==='bookish_host_reports')return[];
  if(rpc==='bookish_club_detail')return{...fixtureClub,club_id:ids.club};
  if(rpc==='bookish_library')return{club:fixtureClub,books:ratings};
  if(rpc==='bookish_recommendations')return recommendations;
  if(rpc==='bookish_rate_book'){const row=ratings.find(r=>r.book.id===body.p_book);if(row)row.my_rating={hearts:body.p_hearts,take:body.p_take,anonymous:body.p_anonymous};return row;}
  if(rpc==='bookish_rating_action')return null;
  return base.respond(url,body,method);
 }};
}
