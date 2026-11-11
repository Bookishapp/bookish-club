// Bookish-only email auth. Dependencies are injectable for local security tests.
import { isIP } from "node:net";
type User = { id: string; app_metadata?: { app?: string } };
type Session = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  user: User;
};
type ShortCode = {
  email_hash: string;
  salt: string;
  code_hash: string;
  expires_at: string;
  attempts: number;
};
type Dependencies = {
  publicKey: string;
  configured: () => Promise<boolean>;
  throttle: (
    email: string,
    ip: string | null,
    action: string,
  ) => Promise<boolean>;
  lookup: (email: string) => Promise<{ id: string; bookish: boolean } | null>;
  create: (email: string) => Promise<unknown>;
  generate: (email: string) => Promise<string>;
  send: (email: string, code: string) => Promise<boolean>;
  verify: (email: string, code: string) => Promise<Session>;
  refresh: (token: string) => Promise<Session>;
  password: (email: string, password: string) => Promise<Session>;
  getUser: (token: string) => Promise<User | null>;
  logout: (token: string) => Promise<void>;
  sync: (token: string) => Promise<void>;
  codes: {
    put: (code: ShortCode) => Promise<boolean>;
    get: (emailHash: string) => Promise<ShortCode | null>;
    finish: (
      emailHash: string,
      salt: string,
      matched: boolean,
    ) => Promise<boolean>;
  };
};
const origins = [
  "https://meetbookish.com",
  "https://www.meetbookish.com",
  "capacitor://localhost",
  "http://localhost",
  "https://localhost",
  "http://localhost:4321",
  "http://127.0.0.1:4321",
];
const hash = async (s: string) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
  ].map((b) => b.toString(16).padStart(2, "0")).join("");
function shortCode(): string {
  const random = new Uint32Array(1);
  // Reject the partial bucket so every four-digit value is equally likely.
  do crypto.getRandomValues(random); while (random[0] >= 4294960000);
  return (random[0] % 10000).toString().padStart(4, "0");
}
function constantTimeEqual(a: string, b: string): boolean {
  let difference = a.length ^ b.length;
  for (let i = 0; i < 64; i++) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return difference === 0;
}
function clientIP(req: Request): string | null {
  // Supabase documents X-Forwarded-For in this Edge Functions example:
  // https://supabase.com/docs/guides/functions/examples/cloudflare-turnstile
  // Accept one valid address only. The docs do not guarantee a trusted hop in
  // a forwarded chain, so ambiguous chains and absent/invalid IPs skip IP limits.
  const value = req.headers.get("x-forwarded-for")?.trim() || "";
  if (value.includes("%")) return null;
  const version = isIP(value);
  if (version === 4) return value;
  // Normalize equivalent IPv6 spellings to one throttle key.
  if (version === 6) {
    return new URL(`http://[${value}]/`).hostname.slice(1, -1);
  }
  return null;
}
export async function bookishAuthHandler(
  req: Request,
  deps: Dependencies,
): Promise<Response> {
  const origin = req.headers.get("origin");
  const headers = {
    "content-type": "application/json",
    "cache-control": "no-store",
    "access-control-allow-origin": origin && origins.includes(origin)
      ? origin
      : origins[0],
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers":
      "authorization, apikey, content-type, x-client-info",
    "vary": "Origin",
  };
  const reply = (status: number, body: unknown) =>
    new Response(body === null ? null : JSON.stringify(body), {
      status,
      headers,
    });
  if (origin && !origins.includes(origin)) {
    return reply(403, { ok: false, message: "Open Bookish to continue." });
  }
  if (req.method === "OPTIONS") return reply(204, null);
  if (req.method !== "POST") return reply(405, { ok: false });
  if (!deps.publicKey) {
    return reply(503, {
      ok: false,
      message: "Sign-in is unavailable. Please try again shortly.",
    });
  }
  let b: Record<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > 8192) return reply(413, { ok: false });
    b = JSON.parse(text);
    if (!b || Array.isArray(b) || typeof b !== "object") throw Error("body");
  } catch {
    return reply(400, { ok: false });
  }
  const action = b.action;
  if (
    !["start", "verify", "password", "refresh", "logout"].includes(
      String(action),
    )
  ) return reply(400, { ok: false });
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  if (
    (action === "start" || action === "verify" || action === "password") &&
    !/^[^\s@<>()",;:]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/.test(email)
  ) return reply(400, { ok: false, message: "Enter your email address." });
  if (
    action === "verify" &&
    (typeof b.token !== "string" || !/^(?:\d{4}|\d{6,10})$/.test(b.token))
  ) {
    return reply(400, {
      ok: false,
      message: "Enter the code from your email.",
    });
  }
  const ip = clientIP(req);
  const rateLimited = () =>
    reply(429, {
      ok: false,
      message: "Please wait a little before trying again.",
    });
  try {
    const emailHash = await hash(`bookish:${email}`);
    if (
      !await deps.throttle(
        emailHash,
        ip === null ? null : await hash(`bookish:${ip}`),
        action === "start" && b.short === true ? "start_short" : String(action),
      )
    ) {
      return rateLimited();
    }
    if (action === "start") {
      if (!await deps.configured()) throw Error("delivery configuration");
      const existing = await deps.lookup(email);
      // Unmarked shared identities must never be changed, signed in, or sent mail.
      if (existing && !existing.bookish) return reply(200, { ok: true });
      if (!existing) {
        try {
          await deps.create(email);
        } catch {
          // Another signup can win the unique-email race. Recheck its trusted marker.
          const raced = await deps.lookup(email);
          if (!raced?.bookish) return reply(200, { ok: true });
        }
      }
      let code: string;
      let salt: string | undefined;
      if (b.short === true) {
        code = shortCode();
        salt = [...crypto.getRandomValues(new Uint8Array(16))]
          .map((value) => value.toString(16).padStart(2, "0")).join("");
        const stored = await deps.codes.put({
          email_hash: emailHash,
          salt,
          code_hash: await hash(`bookish-code:${emailHash}:${salt}:${code}`),
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          attempts: 0,
        });
        if (!stored) return rateLimited();
      } else {
        code = await deps.generate(email);
        if (!/^\d{6,10}$/.test(code)) throw Error("code generation");
      }
      try {
        if (!await deps.send(email, code)) throw Error("delivery");
      } catch (error) {
        // Consume only this undelivered code, preserving any newer replacement.
        if (salt) await deps.codes.finish(emailHash, salt, true);
        throw error;
      }
      return reply(200, { ok: true });
    }
    if (action === "verify" || action === "password" || action === "refresh") {
      if (action === "verify" || action === "password") {
        const existing = await deps.lookup(email);
        if (!existing?.bookish) {
          return reply(401, {
            ok: false,
            message:
              "That code or session could not be verified. Sign in again.",
          });
        }
      }
      if (
        action === "refresh" &&
        (typeof b.refresh_token !== "string" || !b.refresh_token ||
          b.refresh_token.length > 4096)
      ) return reply(401, { ok: false, message: "Sign in again to continue." });
      if (
        action === "password" &&
        (typeof b.password !== "string" || b.password.length < 8 ||
          b.password.length > 1024)
      ) return reply(401, { ok: false, message: "Sign in again to continue." });
      let token = b.token as string;
      if (action === "verify" && token.length === 4) {
        const stored = await deps.codes.get(emailHash);
        if (
          !stored || stored.attempts >= 5 ||
          Date.parse(stored.expires_at) <= Date.now()
        ) throw Error("code unavailable");
        const matched = constantTimeEqual(
          await hash(`bookish-code:${emailHash}:${stored.salt}:${token}`),
          stored.code_hash,
        );
        // The database checks the salt, expiry, and budget again under a row lock.
        if (!await deps.codes.finish(emailHash, stored.salt, matched)) {
          throw Error("code unavailable");
        }
        token = await deps.generate(email);
        if (!/^\d{6,10}$/.test(token)) throw Error("code generation");
      }
      const session = action === "verify"
        ? await deps.verify(email, token)
        : action === "password"
        ? await deps.password(email, b.password as string)
        : await deps.refresh(b.refresh_token as string);
      if (
        session.user?.app_metadata?.app !== "bookish" ||
        !session.access_token || !session.refresh_token
      ) return reply(401, { ok: false, message: "Sign in again to continue." });
      await deps.sync(session.access_token);
      return reply(200, { ok: true, public_key: deps.publicKey, session });
    }
    const token = /^Bearer ([^\s]+)$/i.exec(
      req.headers.get("authorization") || "",
    )?.[1];
    if (!token) return reply(401, { ok: false });
    const user = await deps.getUser(token);
    if (user?.app_metadata?.app !== "bookish") return reply(401, { ok: false });
    await deps.logout(token);
    return reply(200, { ok: true });
  } catch {
    return reply(action === "start" ? 503 : 401, {
      ok: false,
      message: action === "start"
        ? "Email codes are not available right now. Try again soon."
        : "That code or session could not be verified. Sign in again.",
    });
  }
}
