// Public, read-only community stats for "Stuck on what to read next?".
// Reads ONLY the aggregate views from sql/003, which already drop any row
// with fewer clubs than bookish_privacy_floor(). No club names, ids, users
// or raw pours ever leave this function. The site build fetches it hourly.
// GET only. Deployed --no-verify-jwt.
import { sb } from "../_shared/bookish.ts";

const LIMIT = 40;
Deno.serve(async (req) => {
  const headers = { "content-type": "application/json", "access-control-allow-origin": "*", "cache-control": "no-store, max-age=0" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...headers, "access-control-allow-methods": "GET, OPTIONS" } });
  if (req.method !== "GET") return new Response(JSON.stringify({ ok: false, error: "method" }), { status: 405, headers });
  try {
    const q = async (view: string, cols: string, order: string) => {
      const { data, error } = await sb.from(view).select(cols).order(order, { ascending: false }).limit(2000);
      if (error) throw error;
      return data ?? [];
    };
    const [city, state, national, next] = await Promise.all([
      q("bookish_city_book", "city,state,book_id,clubs,mean_pour", "clubs"),
      q("bookish_state_book", "state,book_id,clubs,mean_pour", "clubs"),
      q("bookish_book_stats", "book_id,clubs,mean_pour,finish_rate", "clubs"),
      q("bookish_book_next", "from_book,to_book,clubs", "clubs"),
    ]);
    return new Response(JSON.stringify({ ok: true, generated_at: new Date().toISOString(), city, state, national: national.slice(0, LIMIT), next }), { status: 200, headers });
  } catch (e) {
    console.error("community stats unavailable");
    return new Response(JSON.stringify({ ok: false, error: "server" }), { status: 500, headers });
  }
});
