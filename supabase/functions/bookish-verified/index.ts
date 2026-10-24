// Kept for existing callers. Hidden clubs, including their ids, are excluded.
import {sb} from '../_shared/bookish.ts';
import {directoryHandler} from '../_shared/club-http.ts';
Deno.serve(directoryHandler(sb,'verified'));
