// Shared helpers for the Bookish edge functions.
import { createClient } from "npm:@supabase/supabase-js@2";

export const ALLOWED_ORIGINS = [
  "https://meetbookish.com",
  "https://www.meetbookish.com",
  "https://bookishapp.github.io",
  "https://fictora.github.io", // legacy; drop once meetbookish.com is live
  "http://localhost:4321",
  "http://127.0.0.1:4321",
];
export const SITE_URL = Deno.env.get("BOOKISH_SITE_URL") ?? "https://meetbookish.com";
export const FN_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1`;

export const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

export function cors(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Vary": "Origin",
  };
}
export function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...cors(origin) } });
}
export const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
export const EMAIL_RE = /^[^\s@<>()",;:]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;
export const URLISH = /(https?:\/\/|www\.)/i;

export async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
export const ipOf = (req: Request) => (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";

// Email: sends through Resend only when a Bookish sender is configured
// (BOOKISH_EMAIL_FROM, e.g. "Bookish <hello@bookishclub.com>" on a verified
// domain). Otherwise it is a logged stub and returns false.
export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const from = Deno.env.get("BOOKISH_EMAIL_FROM");
  const key = Deno.env.get("RESEND_API_KEY");
  if (!from || !key) {
    console.log(`[email stub] not sent (no BOOKISH_EMAIL_FROM): subject="${subject}"`);
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  if (!res.ok) console.error("email failed", res.status, await res.text());
  return res.ok;
}

// ---------- verified clubs ----------
// A club is VERIFIED ("On Bookish") when a host's claim or start submission
// for it is confirmed (double opt-in). Everything else in the directory is
// UNCLAIMED: listed from public library / bookstore calendars, and nobody
// can request to join it on Bookish.
// deno-lint-ignore no-explicit-any
export async function isVerified(client: any, club_ref: string): Promise<boolean> {
  const { count } = await client.from("bookish_submissions").select("id", { count: "exact", head: true })
    .eq("club_ref", club_ref).in("kind", ["claim", "start"]).eq("status", "confirmed");
  return (count ?? 0) > 0;
}

export type VerifiedClub = {
  id: string; kind: "claim" | "start"; listed: boolean;
  name?: string; city?: string; state?: string; genre?: string; cadence?: string; format?: string;
};
// deno-lint-ignore no-explicit-any
export async function listVerified(client: any): Promise<VerifiedClub[]> {
  const { data, error } = await client.from("bookish_submissions")
    .select("kind, club_ref, payload, confirmed_at")
    .in("kind", ["claim", "start"]).eq("status", "confirmed").not("club_ref", "is", null)
    .order("confirmed_at", { ascending: false }).limit(5000);
  if (error) throw new Error(error.message);
  const out = new Map<string, VerifiedClub>();
  for (const r of data ?? []) {
    if (out.has(r.club_ref)) continue; // newest confirmed submission wins
    const p = (r.payload ?? {}) as Record<string, string>;
    const listed = p.list_in_city !== "no";
    const v: VerifiedClub = { id: r.club_ref, kind: r.kind, listed };
    if (r.kind === "start" && listed) {
      Object.assign(v, {
        name: (p.club_name ?? "").slice(0, 140), city: (p.city ?? "").slice(0, 80), state: (p.state ?? "").toUpperCase().slice(0, 2),
        genre: p.genre || undefined, cadence: p.cadence || undefined, format: p.format || undefined,
      });
    }
    out.set(r.club_ref, v);
  }
  return [...out.values()];
}
