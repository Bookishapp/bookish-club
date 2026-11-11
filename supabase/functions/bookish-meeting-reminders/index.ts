import { sb } from '../_shared/bookish.ts';
import { readBookishSecret } from '../_shared/secrets.ts';
import { remindersHandler } from '../_shared/meeting-reminders.ts';
async function rpc(name: string, args = {}) {
  const { data, error } = await sb.rpc(name, args);
  if (error) throw Error('Reminder operation unavailable');
  return data;
}
// Schedule only after a separate production approval. This source installs no job.
Deno.serve(remindersHandler({
  key: () => Promise.resolve(Deno.env.get('BOOKISH_REMINDER_WORKER_KEY')),
  config: async () => {
    const [from, resendKey] = await Promise.all([
      readBookishSecret('BOOKISH_EMAIL_FROM'), readBookishSecret('RESEND_API_KEY'),
    ]);
    return from && resendKey ? { from, resendKey } : null;
  },
  claim: () => rpc('bookish_claim_reminders'),
  prepare: (p_id, p_lease) => rpc('bookish_prepare_reminder', { p_id, p_lease }),
  complete: async (p_id, p_lease) => { await rpc('bookish_complete_reminder', { p_id, p_lease }); },
}));
