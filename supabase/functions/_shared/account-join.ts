import type { ClubNotice } from "./types.ts";
import { responseHeaders } from "./account-deletion.ts";
type JoinResult = { club_id: string; status: string; request_id?: string };
type Dependencies = {
  getUser: (
    token: string,
  ) => Promise<{ id: string; app_metadata?: { app?: string } } | null>;
  join: (token: string, ref: string, note: string) => Promise<JoinResult>;
  notice: (request: string, user: string) => Promise<ClubNotice | null>;
  notify: (notice: ClubNotice) => Promise<boolean>;
  done?: (request: string, user: string) => Promise<void>;
};
export function accountJoinHandler(deps: Dependencies) {
  return async (req: Request) => {
    const headers = responseHeaders(req),
      reply = (status: number, body: unknown) =>
        new Response(body === null ? null : JSON.stringify(body), {
          status,
          headers,
        });
    if (req.method === "OPTIONS") return reply(204, null);
    if (req.method !== "POST") return reply(405, { ok: false });
    const token = /^Bearer ([^\s]+)$/i.exec(
      req.headers.get("authorization") || "",
    )?.[1];
    if (!token) {
      return reply(401, { ok: false, message: "Sign in to join a club." });
    }
    try {
      const user = await deps.getUser(token);
      if (user?.app_metadata?.app !== "bookish") {
        return reply(401, {
          ok: false,
          message: "Sign in to Bookish to continue.",
        });
      }
      const text = await req.text();
      if (text.length > 8192) return reply(413, { ok: false });
      const b = JSON.parse(text);
      if (
        typeof b?.p_ref !== "string" || b.p_ref.length > 80 ||
        typeof b.p_note !== "string" || b.p_note.length > 500
      ) return reply(400, { ok: false });
      const result = await deps.join(token, b.p_ref, b.p_note);
      let notified: boolean | undefined;
      if (result.request_id) {
        try {
          const notice = await deps.notice(result.request_id, user.id);
          if (notice) {
            notified = await deps.notify(notice);
            if (notified) await deps.done?.(result.request_id, user.id);
          }
        } catch {
          notified = false;
        }
      }
      return reply(200, {
        ok: true,
        ...result,
        ...(notified === undefined ? {} : { host_notified: notified }),
      });
    } catch {
      return reply(400, {
        ok: false,
        message: "This club is unavailable. Your host can help you join.",
      });
    }
  };
}
