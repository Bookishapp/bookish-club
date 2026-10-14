// Public, read-only list of VERIFIED clubs: clubs a host has claimed (or
// started) and confirmed by email, so they are actually on Bookish.
// The static site build reads this to split every list into
// "On Bookish" vs "Listed from public calendars".
// GET only. Deployed --no-verify-jwt. Returns no emails or contact details,
// and for clubs started on Bookish only city-level facts (never the
// free-text "about", which can name a venue).
import { sb, listVerified } from "../_shared/bookish.ts";

Deno.serve(async (req) => {
  const headers = {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "cache-control": "public, max-age=120",
  };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...headers, "access-control-allow-methods": "GET, OPTIONS" } });
  if (req.method !== "GET") return new Response(JSON.stringify({ ok: false, error: "method" }), { status: 405, headers });
  try {
    const clubs = await listVerified(sb);
    return new Response(JSON.stringify({ ok: true, generated_at: new Date().toISOString(), clubs }), { status: 200, headers });
  } catch (e) {
    console.error("verified list failed", (e as Error).message);
    return new Response(JSON.stringify({ ok: false, error: "server" }), { status: 500, headers });
  }
});
