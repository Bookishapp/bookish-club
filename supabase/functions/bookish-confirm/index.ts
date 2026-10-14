// Bookish Club double opt-in: GET ?token=<uuid> marks the submission confirmed
// and redirects to the site's /confirmed/ page.
import { createClient } from "npm:@supabase/supabase-js@2";

const SITE_URL = Deno.env.get("BOOKISH_SITE_URL") ?? "https://fictora.github.io/bookish-club";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  let ok = false;
  if (UUID_RE.test(token)) {
    const { data, error } = await sb.from("bookish_submissions")
      .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
      .eq("confirm_token", token).neq("status", "spam")
      .select("id");
    ok = !error && (data?.length ?? 0) > 0;
  }
  return new Response(null, {
    status: 302,
    headers: { location: `${SITE_URL}/confirmed/${ok ? "" : "?status=invalid"}` },
  });
});
