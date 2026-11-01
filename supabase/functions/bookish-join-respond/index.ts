// GET opens the website confirmation. Only its deliberate POST decides.
import {sb,siteUrl} from '../_shared/bookish.ts';
import {clubNotice} from '../_shared/club-notice.ts';
import {joinRespondHandler} from '../_shared/join-respond.ts';
Deno.serve(joinRespondHandler({
 decide:(token,approve)=>sb.rpc('bookish_visibility_decide',{p_token:token,p_approve:approve}),
 notify:clubNotice,
 siteUrl,
}));
