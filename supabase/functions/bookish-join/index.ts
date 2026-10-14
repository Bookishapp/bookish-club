// "Request to join" a club. Public POST (deployed --no-verify-jwt).
// ONLY for VERIFIED clubs (a host claimed or started it and confirmed by
// email, so it is actually on Bookish). Requests for unclaimed clubs, which
// are listed from public library / bookstore calendars, are rejected with
// 403 not_on_bookish, invite code or not.
// - With a valid invite code for the club: joins straight away (via='invite').
// - Otherwise: stores a pending request; if the club has a verified host
//   (confirmed claim/start), the host is emailed approve/decline links.
//   The requester never sees host contact details, and vice versa until the
//   host approves.
import { cors, json, str, EMAIL_RE, URLISH, sha256, ipOf, sb, sendEmail, FN_URL, isVerified } from "../_shared/bookish.ts";

const MAX_PER_IP_PER_HOUR = 5;
const MAX_PER_EMAIL_PER_DAY = 8;
const MIN_FILL_MS = 2500;

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405, origin);
  if (origin && !cors(origin)["Access-Control-Allow-Origin"].startsWith(origin)) return json({ ok: false, error: "origin" }, 403, origin);

  let b: Record<string, unknown>;
  try { const raw = await req.text(); if (raw.length > 6000) throw 0; b = JSON.parse(raw); }
  catch { return json({ ok: false, error: "bad_json" }, 400, origin); }

  // Server-side rule: only verified clubs can be joined on Bookish.
  const ref0 = str(b.club_id, 80);
  if (ref0.length < 3) return json({ ok: false, error: "club" }, 400, origin);
  if (!(await isVerified(sb, ref0))) return json({ ok: false, error: "not_on_bookish" }, 403, origin);

  if (str(b.website, 200) !== "" || !(Number(b.elapsed_ms) >= MIN_FILL_MS)) return json({ ok: true, status: "pending" }, 200, origin);

  const club_ref = str(b.club_id, 80);
  const club_name = str(b.club_name, 160);
  const email = str(b.email, 254).toLowerCase();
  const first_name = str(b.first_name, 60);
  const note = str(b.note, 500);
  const code = str(b.invite_code, 12).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (club_ref.length < 3) return json({ ok: false, error: "club" }, 400, origin);
  if (!EMAIL_RE.test(email)) return json({ ok: false, error: "email" }, 400, origin);
  if (URLISH.test(note)) return json({ ok: false, error: "links_not_allowed" }, 400, origin);
  if (b.consent !== true) return json({ ok: false, error: "consent" }, 400, origin);

  const ip_hash = await sha256(`bookish:${ipOf(req)}`);
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const dayAgo = new Date(Date.now() - 86400_000).toISOString();
  const [{ count: ipCount }, { count: emailCount }, { count: dup }] = await Promise.all([
    sb.from("bookish_join_requests").select("id", { count: "exact", head: true }).eq("ip_hash", ip_hash).gte("created_at", hourAgo),
    sb.from("bookish_join_requests").select("id", { count: "exact", head: true }).eq("email", email).gte("created_at", dayAgo),
    sb.from("bookish_join_requests").select("id", { count: "exact", head: true }).eq("email", email).eq("club_ref", club_ref).neq("status", "declined"),
  ]);
  if ((ipCount ?? 0) >= MAX_PER_IP_PER_HOUR || (emailCount ?? 0) >= MAX_PER_EMAIL_PER_DAY) return json({ ok: false, error: "rate_limited" }, 429, origin);
  if ((dup ?? 0) > 0) return json({ ok: true, status: "already_requested" }, 200, origin);

  // Invite link / code path: skips the request.
  let via: "request" | "invite" = "request";
  if (code) {
    const { data: inv } = await sb.from("bookish_invites").select("code, club_ref, expires_at, max_uses, uses").eq("code", code).maybeSingle();
    const valid = inv && inv.club_ref === club_ref && (!inv.expires_at || new Date(inv.expires_at) > new Date()) && (inv.max_uses == null || inv.uses < inv.max_uses);
    if (!valid) return json({ ok: false, error: "invite_invalid" }, 400, origin);
    via = "invite";
    await sb.from("bookish_invites").update({ uses: inv!.uses + 1 }).eq("code", code);
  }

  const { data: row, error } = await sb.from("bookish_join_requests").insert({
    club_ref, club_name, email, first_name, note, via, ip_hash,
    status: via === "invite" ? "approved" : "pending",
    decided_at: via === "invite" ? new Date().toISOString() : null,
  }).select("id, decision_token").single();
  if (error) { console.error("insert failed", error.message); return json({ ok: false, error: "server" }, 500, origin); }
  if (via === "invite") return json({ ok: true, status: "joined" }, 200, origin);

  // The verified host for this club (confirmed claim or start).
  const { data: host } = await sb.from("bookish_submissions").select("email, payload")
    .eq("club_ref", club_ref).in("kind", ["claim", "start"]).eq("status", "confirmed")
    .order("confirmed_at", { ascending: false }).limit(1).maybeSingle();
  let notified = false;
  if (host?.email) {
    const t = row.decision_token;
    notified = await sendEmail(host.email, `Someone would like to join ${club_name || "your book club"}`,
      `Hello,\n\n${first_name || "A reader"} asked to join ${club_name || "your club"} on Bookish.\n\n` +
      (note ? `Their note:\n"${note}"\n\n` : "") +
      `Approve: ${FN_URL}/bookish-join-respond?token=${t}&action=approve\nDecline: ${FN_URL}/bookish-join-respond?token=${t}&action=decline\n\n` +
      `If you approve, we'll send them your reply-to email so you can share the next meeting. If you decline, they'll get a kind note and nothing else.\n\nBookish`);
    if (notified) await sb.from("bookish_join_requests").update({ host_notified: true }).eq("id", row.id);
  }
  return json({ ok: true, status: "pending", host_on_bookish: true, host_notified: notified }, 200, origin);
});
