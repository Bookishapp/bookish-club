import { accountJoinHandler } from "../_shared/account-join.ts";
import { authAdmin } from "../_shared/auth-admin.ts";
import { sb } from "../_shared/bookish.ts";
import { clubNotice } from "../_shared/club-notice.ts";
const url = Deno.env.get("SUPABASE_URL")!,
  key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  publicKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = authAdmin(url, key);
Deno.serve(accountJoinHandler({
  getUser: admin.getUser,
  join: async (token, p_ref, p_note) => {
    const r = await fetch(`${url}/rest/v1/rpc/bookish_join_club`, {
      method: "POST",
      headers: {
        apikey: publicKey,
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ p_ref, p_note }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw Error("Join unavailable");
    return await r.json();
  },
  notice: async (p_request, p_user) => {
    const { data, error } = await sb.rpc("bookish_join_notice", {
      p_request,
      p_user,
    });
    if (error) throw Error("Notice unavailable");
    return data;
  },
  notify: clubNotice,
  done: async (p_request, p_user) => {
    const { error } = await sb.rpc("bookish_join_notice_done", {
      p_request,
      p_user,
    });
    if (error) throw Error("Notice acknowledgement unavailable");
  },
}));
