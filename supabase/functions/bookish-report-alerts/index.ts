// Server-only queue polling. No public or signed-in reader may read reports.
import {sb} from '../_shared/bookish.ts';
import {readBookishSecret} from '../_shared/secrets.ts';
import {reportAlertsHandler} from '../_shared/report-alerts.ts';
Deno.serve(reportAlertsHandler({
 key:()=>readBookishSecret('BOOKISH_REPORT_WORKER_KEY'),
 queue:after=>sb.rpc('bookish_content_report_queue',{p_after:after}),
}));
