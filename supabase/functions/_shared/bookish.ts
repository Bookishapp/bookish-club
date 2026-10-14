// Shared helpers for the Bookish edge functions.
import { createClient } from "npm:@supabase/supabase-js@2";

export const ALLOWED_ORIGINS = [
  "https://bookishclub.com",
  "https://www.bookishclub.com",
  "https://fictora.github.io",
  "http://localhost:4321",
  "http://127.0.0.1:4321",
];
export const SITE_URL = Deno.env.get("BOOKISH_SITE_URL") ?? "https://fictora.github.io/bookish-club";
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
