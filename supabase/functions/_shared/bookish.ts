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
// (BOOKISH_EMAIL_FROM, e.g. "Bookish <hello@meetbookish.com>", plus
// RESEND_API_KEY). This is a secret-presence gate, not a verification check.
// Verify DNS before setting BOOKISH_EMAIL_FROM; Resend enforces verification.
// Without both settings it is a logged stub and returns false.
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
  if (!res.ok) console.error("email failed", res.status);
  return res.ok;
}

// Fresh, visibility-aware discovery, shared with legacy callers.
export async function listVerified(client: any): Promise<any[]> {
  const {data,error}=await client.rpc("bookish_visibility_directory");
  if(error)throw new Error("Discovery unavailable");
  return (data??[]).filter((c:any)=>c.verified && ["open","private"].includes(c.visibility)).map((c:any)=>({...c,listed:true,kind:"start"}));
}
export async function isVerified(client:any,ref:string):Promise<boolean>{
  return (await listVerified(client)).some((c:any)=>c.id===ref);
}
