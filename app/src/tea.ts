import { esc } from './domain.ts';
import { icon, spot } from './design.ts';
export type RPC=(name:string,args?:Record<string,unknown>)=>Promise<any>;
export interface Take {id:string;parent_id:string|null;body:string|null;page:number|null;did_not_finish:boolean;sealed:boolean;sips:number;sipped:boolean;reply_count:number;created_at:string}
export interface Reading {book:any;my_page:number;my_finished:boolean;my_did_not_finish:boolean;sharing:boolean;meeting_mark:number|null;members:{user_id:string;display_name:string;page:number;finished:boolean}[]}
export interface ClubNotification {id:string;club_id:string;kind:'new_take'|'vote_opened'|'meeting_reminder'|'join_request';target_id:string;created_at:string;read_at:string|null}
export const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function takePayload(club:string,book:string,body:string,page:number|null,dnf:boolean,parent:string|null=null){
 body=body.trim();if(!body||[...body].length>280)throw Error('Write a take between 1 and 280 characters.');
 if(dnf?page!==null:page===null||!Number.isInteger(page)||page<0)throw Error('Choose a page, no spoilers, or DNF.');
 return {p_club:club,p_book:book,p_body:body,p_page:page,p_dnf:dnf,p_parent:parent};
}
export function takeCard(t:Take,thread=false):string{
 const sealed=t.sealed||t.body===null,marker=t.did_not_finish?'DNF':t.page===0?'No spoilers':`p. ${t.page}`;
 return `<article class="take-card ${sealed?'take-sealed':''}" data-take-id="${esc(t.id)}"><header><span class="anonymous-mask" aria-hidden="true"><svg viewBox="0 0 30 24" width="22" height="20" fill="none"><path d="M3 7 Q8 5 15 8 Q22 5 27 7 L26 15 Q22 20 17 14 L15 12 L13 14 Q8 20 4 15 Z" fill="#f5ead8"/><path d="M7 11 L11 12 M19 12 L23 11" stroke="#1d1712" stroke-width="2" stroke-linecap="round"/></svg></span><strong>Anonymous</strong><span class="take-marker">${esc(marker)}</span><button class="take-menu" data-content="${esc(t.id)}" data-kind="take" data-label="Anonymous take" aria-label="Report, hide, or block this take">···</button></header>${sealed?`<div class="sealed-take"><div class="sealed-lines" aria-hidden="true"><i></i><i></i><i></i></div><p>${icon('lock')} ${t.did_not_finish?'Sealed until you finish':`Sealed until p. ${t.page}`}</p><small>Log your page to read when you’re ready.</small></div>`:`<p class="take-body">${esc(t.body!)}</p><footer><button class="sip-button" data-sip="${esc(t.id)}" data-sipped="${t.sipped}" aria-pressed="${t.sipped}" aria-label="${t.sipped?'Remove sip':'Sip this take'}">${spot('tea',24)} ${t.sips} <span>${t.sips===1?'sip':'sips'}</span></button>${!thread?`<button class="reply-button" data-thread="${esc(t.id)}">${icon('chat')} ${t.reply_count} <span>${t.reply_count===1?'reply':'replies'}</span></button>`:''}<button class="take-share" data-card-kind="take" data-card-id="${esc(t.id)}" aria-label="Share sealed take card">${icon('share')}</button></footer>`}</article>`;
}
export class ReadingRequest {
 private key='';private request='';private makeID:()=>string;
 constructor(makeID=()=>crypto.randomUUID()){this.makeID=makeID;}
 values(club:string,book:string,page:number,finished:boolean,dnf:boolean){
  if(!Number.isInteger(page)||page<0||finished&&dnf)throw Error('Choose a valid page and one reading status.');
  const key=JSON.stringify([club,book,page,finished,dnf]);if(this.key!==key){this.key=key;this.request=this.makeID();}
  return {p_club:club,p_book:book,p_page:page,p_finished:finished,p_dnf:dnf,p_request:this.request};
 }
 clear(){this.key='';this.request='';}
}
export function messageLink(kind:'take'|'vote'|'meeting',id:string){if(!uuid.test(id))throw Error('This card is unavailable.');return `https://meetbookish.com/imessage/v2/${kind}/${id}`;}
