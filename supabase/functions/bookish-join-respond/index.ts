// Host approves or declines a join request from the emailed link:
// GET ?token=<uuid>&action=approve|decline -> updates the request, emails the
// reader, and redirects the host to a confirmation page.
import { sb, sendEmail, SITE_URL } from "../_shared/bookish.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const u = new URL(req.url);
  const token = u.searchParams.get("token") ?? "";
  const action = u.searchParams.get("action");
  let result = "invalid";
  if (UUID_RE.test(token) && (action === "approve" || action === "decline")) {
    const { data } = await sb.from("bookish_join_requests")
      .update({ status: action === "approve" ? "approved" : "declined", decided_at: new Date().toISOString() })
      .eq("decision_token", token).eq("status", "pending")
      .select("email, first_name, club_name, club_ref").maybeSingle();
    if (data) {
      result = action === "approve" ? "approved" : "declined";
      let hostEmail: string | null = null;
      if (action === "approve") {
        const { data: host } = await sb.from("bookish_submissions").select("email")
          .eq("club_ref", data.club_ref).in("kind", ["claim", "start"]).eq("status", "confirmed")
          .order("confirmed_at", { ascending: false }).limit(1).maybeSingle();
        hostEmail = host?.email ?? null;
      }
      await sendEmail(data.email,
        action === "approve" ? `You're in: ${data.club_name || "your book club"}` : `About your request to join ${data.club_name || "a book club"}`,
        action === "approve"
          ? `Good news${data.first_name ? ", " + data.first_name : ""}! The host of ${data.club_name || "the club"} said yes.` +
            (hostEmail ? ` Reply to them at ${hostEmail} to get the next meeting details.` : "") + `\n\nHappy reading,\nBookish`
          : `Thanks for asking to join ${data.club_name || "the club"}. The host isn't taking new members right now. There are plenty of other clubs nearby: ${SITE_URL}/\n\nBookish`);
    }
  }
  return new Response(null, { status: 302, headers: { location: `${SITE_URL}/join/done/?result=${result}` } });
});
