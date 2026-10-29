// Bookish Club form intake: claim a club, start a club, host-tools waitlist.
// Public endpoint (deployed with --no-verify-jwt). Writes with the service
// role into public.bookish_submissions (RLS on, no policies).
//
// Spam protection: honeypot field, minimum fill time, per-IP and per-email
// rate limits, strict validation and size caps.
// Double opt-in: if BOOKISH_EMAIL_FROM + RESEND_API_KEY are set, a confirm
// link is emailed; otherwise rows stay `pending` until email is switched on.
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://meetbookish.com",
  "https://www.meetbookish.com",
  "https://bookishapp.github.io",
  "https://fictora.github.io", // legacy; drop once meetbookish.com is live
  "http://localhost:4321",
  "http://127.0.0.1:4321",
];
const MAX_PER_IP_PER_HOUR = 6;
const MAX_PER_EMAIL_PER_DAY = 3;
const MIN_FILL_MS = 2500;

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

function cors(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...cors(origin) },
  });
}

const str = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

const EMAIL_RE = /^[^\s@<>()",;:]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;
const URLISH = /(https?:\/\/|www\.)/i;

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const FIELDS: Record<string, Record<string, number>> = {
  claim: { visibility: 10, club_name: 160, club_city: 80, role: 40, first_name: 60, message: 1000, club_url: 300, meets_at: 20, show_on_map: 5 },
  start: { visibility: 10, club_name: 160, city: 80, state: 2, zip: 10, genre: 40, cadence: 80, format: 20, first_name: 60, about: 1000, meets_at: 20, show_on_map: 5 },
  waitlist: { first_name: 60, city: 80, is_host: 5, features: 200, club_size: 20 },
};

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405, origin);
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return json({ ok: false, error: "origin" }, 403, origin);

  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 8000) return json({ ok: false, error: "too_large" }, 413, origin);
    body = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: "bad_json" }, 400, origin);
  }

  const kind = str(body.kind, 10);
  if (!(kind in FIELDS)) return json({ ok: false, error: "kind" }, 400, origin);

  // Honeypot + timing trap: pretend success so bots learn nothing.
  const elapsed = Number(body.elapsed_ms ?? 0);
  if (str(body.website, 200) !== "" || !Number.isFinite(elapsed) || elapsed < MIN_FILL_MS) {
    return json({ ok: true }, 200, origin);
  }

  const email = str(body.email, 254).toLowerCase();
  if (!EMAIL_RE.test(email)) return json({ ok: false, error: "email" }, 400, origin);

  const payload: Record<string, string> = {};
  for (const [k, max] of Object.entries(FIELDS[kind])) {
    const v = str(body[k], max);
    if (v) payload[k] = v;
  }
  if (kind === "claim" && !payload.club_name) return json({ ok: false, error: "club_name" }, 400, origin);
  if (kind === "start" && (!payload.club_name || !payload.city)) return json({ ok: false, error: "club_details" }, 400, origin);
  if (kind !== "waitlist" && !["open", "private", "hidden"].includes(payload.visibility)) return json({ ok: false, error: "visibility" }, 400, origin);
  if (kind === "start") {
    const { data: validCity, error: cityError } = await sb.rpc("bookish_visibility_location", { p_city: payload.city, p_state: payload.state });
    if (cityError) return json({ ok: false, error: "server" }, 503, origin);
    if (!validCity) return json({ ok: false, error: "city" }, 400, origin);
  }
  // Links in free text are the most common spam tell.
  if (URLISH.test(`${payload.message ?? ""} ${payload.about ?? ""} ${payload.club_name ?? ""}`)) {
    return json({ ok: false, error: "links_not_allowed" }, 400, origin);
  }
  if (body.consent !== true) return json({ ok: false, error: "consent" }, 400, origin);

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const ipHash = await sha256(`bookish:${ip}`);
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const dayAgo = new Date(Date.now() - 86400_000).toISOString();

  const [{ count: ipCount }, { count: emailCount }] = await Promise.all([
    sb.from("bookish_submissions").select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash).gte("created_at", hourAgo),
    sb.from("bookish_submissions").select("id", { count: "exact", head: true })
      .eq("email", email).eq("kind", kind).gte("created_at", dayAgo),
  ]);
  if ((ipCount ?? 0) >= MAX_PER_IP_PER_HOUR || (emailCount ?? 0) >= MAX_PER_EMAIL_PER_DAY) {
    return json({ ok: false, error: "rate_limited" }, 429, origin);
  }

  // "List my club in <city>": the public directory/map is city-level only;
  // no address, venue or neighborhood is ever published. Home-based clubs
  // default to not listed (the form sends false unless the host opts in).
  if (kind !== "waitlist") payload.list_in_city = payload.visibility === "hidden" ? "no" : "yes";
  delete payload.show_on_map;
  const clubRef = kind === "claim" ? str(body.club_id, 80) || null
    : kind === "start" ? `new-${crypto.randomUUID().slice(0, 8)}` : null;
  const { data, error } = await sb.from("bookish_submissions").insert({
    kind, email, club_ref: clubRef, payload, ip_hash: ipHash,
    user_agent: str(req.headers.get("user-agent"), 300),
  }).select("id, confirm_token").single();
  if (error) {
    console.error("insert failed", error.message);
    return json({ ok: false, error: "server" }, 500, origin);
  }

  // Secret-presence gate only. Verify the sender domain before setting FROM;
  // Resend, not this handler, rejects sends from an unverified domain.
  const from = Deno.env.get("BOOKISH_EMAIL_FROM");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  let confirmSent = false;
  if (from && resendKey) {
    const confirmUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/bookish-confirm?token=${data.confirm_token}`;
    const what = kind === "claim"
      ? `your claim for ${payload.club_name}`
      : kind === "start" ? `your new club, ${payload.club_name}` : "the host tools waitlist";
    let res: Response;
    try {
      res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${resendKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          from, to: [email],
          subject: "Please confirm your email for Bookish",
          text: `Hello${payload.first_name ? " " + payload.first_name : ""},\n\nThanks for reaching out about ${what}. Please confirm this is your email address:\n\n${confirmUrl}\n\nIf this wasn't you, ignore this note and nothing will happen.\n\nWarmly,\nBookish`,
        }),
      });
    } catch {
      // The row is already saved. Do not turn an email transport failure into
      // a failed submission, or log exception details that could expose data.
      console.error("confirm email request failed");
      return json({ ok: true, confirm_sent: false }, 200, origin);
    }
    confirmSent = res.ok;
    if (res.ok) await sb.from("bookish_submissions").update({ email_sent_at: new Date().toISOString() }).eq("id", data.id);
    else console.error("confirm email failed", res.status);
  }

  return json({ ok: true, confirm_sent: confirmSent }, 200, origin);
});
