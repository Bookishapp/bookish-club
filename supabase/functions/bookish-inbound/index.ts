import { inboundHandler } from "../_shared/inbound.ts";
import { sb } from "../_shared/bookish.ts";
import { readBookishSecret } from "../_shared/secrets.ts";

Deno.serve(inboundHandler({
  secret: () => readBookishSecret("RESEND_INBOUND_WEBHOOK_SECRET"),
  apiKey: () => readBookishSecret("RESEND_API_KEY"),
  forwardTo: () => readBookishSecret("BOOKISH_INBOX_FORWARD_TO"),
  begin: async (id) => {
    const { data, error } = await sb.rpc("bookish_inbound_begin", {
      p_email_id: id,
    });
    if (error || !["send", "done", "expired"].includes(data)) {
      throw Error("Inbound state unavailable");
    }
    return data as "send" | "done" | "expired";
  },
  complete: async (id) => {
    const { error } = await sb.rpc("bookish_inbound_complete", {
      p_email_id: id,
    });
    if (error) throw Error("Inbound completion unavailable");
  },
}));
