import { bookishAuthHandler } from "../_shared/bookish-auth.ts";
import { sb, sendEmail } from "../_shared/bookish.ts";
import { authAdmin } from "../_shared/auth-admin.ts";
import { readBookishSecret } from "../_shared/secrets.ts";
const url = Deno.env.get("SUPABASE_URL")!;
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const publicKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const admin = authAdmin(url, key);
async function auth(path: string, body: unknown, token = key) {
  const r = await fetch(`${url}/auth/v1/${path}`, {
    method: "POST",
    headers: {
      // Service calls need the secret key as apikey too: the hosted gateway
      // rejects a publishable apikey paired with a secret bearer (403).
      apikey: token === key ? key : publicKey || key,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw Error("Auth unavailable");
  return r.status === 204 ? null : await r.json();
}
Deno.serve((req) =>
  bookishAuthHandler(req, {
    publicKey,
    configured: async () =>
      !!(await readBookishSecret("BOOKISH_EMAIL_FROM")) &&
      !!(await readBookishSecret("RESEND_API_KEY")),
    throttle: async (email, ip, action) => {
      const { data, error } = await sb.rpc("bookish_auth_throttle", {
        p_email: email,
        p_ip: ip,
        p_action: action,
      });
      if (error) throw Error("Rate limiter unavailable");
      return data === true;
    },
    codes: {
      put: async (code) => {
        const { error } = await sb.from("bookish_auth_codes").upsert(code, {
          onConflict: "email_hash",
        });
        if (error) throw Error("Code storage unavailable");
      },
      get: async (emailHash) => {
        const { data, error } = await sb.from("bookish_auth_codes")
          .select("email_hash,salt,code_hash,expires_at,attempts")
          .eq("email_hash", emailHash).maybeSingle();
        if (error) throw Error("Code storage unavailable");
        return data;
      },
      finish: async (emailHash, salt, matched) => {
        const { data, error } = await sb.rpc("bookish_auth_code_finish", {
          p_email_hash: emailHash,
          p_salt: salt,
          p_matched: matched,
        });
        if (error) throw Error("Code storage unavailable");
        return data === true;
      },
    },
    lookup: async (email) => {
      const { data, error } = await sb.rpc("bookish_auth_lookup", {
        p_email: email,
      });
      if (error) throw Error("Lookup unavailable");
      return data;
    },
    create: (email) =>
      auth("admin/users", {
        email,
        email_confirm: false,
        app_metadata: { app: "bookish" },
      }),
    generate: async (email) => {
      const result = await auth("admin/generate_link", {
        type: "magiclink",
        email,
      });
      return result.email_otp;
    },
    send: (email, code) =>
      sendEmail(
        email,
        "Your Bookish sign-in code",
        `Your Bookish code is ${code}.\n\nEnter it in Bookish to continue. If you did not request it, you can ignore this email.\n\nBookish`,
      ),
    verify: (email, token) => auth("verify", { type: "email", email, token }),
    password: (email, password) =>
      auth("token?grant_type=password", { email, password }),
    refresh: (refresh_token) =>
      auth("token?grant_type=refresh_token", { refresh_token }),
    getUser: admin.getUser,
    logout: async (token) => {
      await auth("logout?scope=global", {}, token);
    },
    sync: async (token) => {
      const r = await fetch(`${url}/rest/v1/rpc/bookish_sync_account`, {
        method: "POST",
        headers: {
          apikey: publicKey,
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: "{}",
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) throw Error("Account sync unavailable");
    },
  })
);
