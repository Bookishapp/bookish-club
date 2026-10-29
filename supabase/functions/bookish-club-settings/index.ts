import {sb} from '../_shared/bookish.ts';
import {hostHandler} from '../_shared/club-http.ts';
import {clubNotice} from '../_shared/club-notice.ts';
Deno.serve(hostHandler(sb,clubNotice));
