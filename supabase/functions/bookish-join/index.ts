// The database serializes joins, invite consumption, and visibility changes.
import {sb} from '../_shared/bookish.ts';
import {joinHandler} from '../_shared/club-http.ts';
import {clubNotice} from '../_shared/club-notice.ts';
Deno.serve(joinHandler(sb,clubNotice));
