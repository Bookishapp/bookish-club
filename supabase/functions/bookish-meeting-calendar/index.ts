import { authAdmin } from '../_shared/auth-admin.ts';
import { calendarHandler } from '../_shared/meeting-reminders.ts';
const url = Deno.env.get('SUPABASE_URL')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, publicKey = Deno.env.get('SUPABASE_ANON_KEY')!;
Deno.serve(calendarHandler({
  getUser: authAdmin(url, service).getUser,
  calendar: async (token, p_meeting) => {
    const response = await fetch(`${url}/rest/v1/rpc/bookish_meeting_calendar`, {
      method: 'POST',
      headers: { apikey: publicKey, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_meeting }), signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw Error('Calendar unavailable');
    return response.json();
  },
}));
