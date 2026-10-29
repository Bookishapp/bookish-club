// Runtime delivery only. Tests inject a local callback and never send email.
import {sendEmail,FN_URL,SITE_URL} from './bookish.ts';
export async function clubNotice(n:any):Promise<boolean>{
 if(n.kind==='request')return sendEmail(n.to,`Someone would like to join ${n.club}`,
  `${n.name||'A reader'} asked to join ${n.club}.\n\n${n.note||''}\n\nApprove: ${FN_URL}/bookish-join-respond?token=${n.decision_token}&action=approve\nDecline: ${FN_URL}/bookish-join-respond?token=${n.decision_token}&action=decline\n\nBookish`);
 return sendEmail(n.to,n.approved?`You're in: ${n.club}`:`About your request to join ${n.club}`,
  n.approved?`The host of ${n.club} approved your request.${n.host_email?` Contact them at ${n.host_email} for the next meeting.`:''}\n\nBookish`:`The host isn't taking new members right now. Find other clubs at ${SITE_URL}/\n\nBookish`);
}
