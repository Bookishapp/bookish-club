// Kept free of runtime SDK imports so request and Apple security paths are testable.
type User = {
  id: string;
  app_metadata?: { app?: string };
  identities?: Array<{ provider: string; identity_data?: { sub?: string } }>;
};
type Dependencies = {
  getUser: (token: string) => Promise<User | null>;
  deleteUser: (id: string) => Promise<void>;
  revokeApple: (code: string, subject: string) => Promise<void>;
};
const origins = ["https://meetbookish.com", "https://www.meetbookish.com"];
export function responseHeaders(req: Request) {
  const origin = req.headers.get("origin");
  return {
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
}
export async function handleAccountDeletion(
  req: Request,
  deps: Dependencies,
): Promise<Response> {
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: responseHeaders(req),
    });
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: responseHeaders(req) });
  }
  if (req.method !== "POST") {
    return reply(405, {
      ok: false,
      message: "Use the account button to begin.",
    });
  }
  const token = /^Bearer ([^\s]+)$/i.exec(
    req.headers.get("authorization") ?? "",
  )?.[1];
  if (!token) {
    return reply(401, {
      ok: false,
      message: "Sign in to manage your account.",
    });
  }
  let user: User | null;
  try {
    user = await deps.getUser(token);
  } catch {
    return reply(401, {
      ok: false,
      message: "Sign in to manage your account.",
    });
  }
  if (!user) {
    return reply(401, {
      ok: false,
      message: "Sign in to manage your account.",
    });
  }
  if (user.app_metadata?.app !== "bookish") {
    return reply(403, { ok: false, message: "This is not a Bookish account." });
  }
  let body: { apple_authorization_code?: unknown };
  try {
    const text = await req.text();
    if (text.length > 8192) {
      return reply(413, { ok: false, message: "A little less fits here." });
    }
    body = text ? JSON.parse(text) : {};
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw Error("body");
    }
  } catch {
    return reply(400, { ok: false, message: "Let’s try that request again." });
  }
  const apple = user.identities?.find((identity) =>
    identity.provider === "apple"
  );
  if (apple) {
    const code = body.apple_authorization_code;
    if (typeof code !== "string" || !code.trim() || code.length > 4096) {
      return reply(400, {
        ok: false,
        code: "apple_reauthentication_required",
        message:
          "Continue with Apple once more to finish deleting your account.",
      });
    }
    if (!apple.identity_data?.sub) {
      return reply(503, {
        ok: false,
        message: "Please try again in a moment.",
      });
    }
    try {
      await deps.revokeApple(code, apple.identity_data.sub);
    } catch {
      return reply(503, {
        ok: false,
        message: "Please try again with a fresh Apple sign-in.",
      });
    }
  }
  try {
    // Hard deletion: auth FK cascades and Bookish triggers remove all personal rows.
    await deps.deleteUser(user.id);
    return reply(200, {
      ok: true,
      message:
        "Your account is deleted. Thank you for sharing a chapter with us.",
    });
  } catch {
    return reply(503, {
      ok: false,
      message: "Please try again in a moment to finish deleting your account.",
    });
  }
}

type AppleConfig = {
  clientId: string;
  teamId: string;
  keyId: string;
  privateKey: string;
};
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/=/g, "").replace(/\+/g, "-")
    .replace(/\//g, "_");
const decode = (value: string) =>
  Uint8Array.from(
    atob(
      value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
        Math.ceil(value.length / 4) * 4,
        "=",
      ),
    ),
    (c) => c.charCodeAt(0),
  );
export async function revokeAppleGrant(
  code: string,
  subject: string,
  config: AppleConfig,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  if (
    !config.clientId || !config.teamId || !config.keyId || !config.privateKey
  ) throw Error("Apple configuration required");
  const now = Math.floor(Date.now() / 1000);
  const enc = new TextEncoder();
  const head = b64url(
    enc.encode(JSON.stringify({ alg: "ES256", kid: config.keyId, typ: "JWT" })),
  );
  const payload = b64url(
    enc.encode(
      JSON.stringify({
        iss: config.teamId,
        iat: now,
        exp: now + 300,
        aud: "https://appleid.apple.com",
        sub: config.clientId,
      }),
    ),
  );
  const pem = config.privateKey.replace(/\\n/g, "\n").replace(
    /-----[^-]+-----/g,
    "",
  ).replace(/\s/g, "");
  const key = await crypto.subtle.importKey(
    "pkcs8",
    decode(pem),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      enc.encode(`${head}.${payload}`),
    ),
  );
  const secret = `${head}.${payload}.${b64url(signature)}`;
  const exchanged = await fetcher("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: secret,
      code,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!exchanged.ok) throw Error("Apple exchange incomplete");
  const tokens = await exchanged.json();
  // The ID token comes directly from Apple's TLS token endpoint, not the caller.
  const claims = JSON.parse(
    new TextDecoder().decode(decode(tokens.id_token.split(".")[1])),
  );
  if (
    claims.sub !== subject || claims.aud !== config.clientId ||
    claims.iss !== "https://appleid.apple.com" || claims.exp <= now
  ) {
    throw Error("Apple identity mismatch");
  }
  const revokeToken = tokens.refresh_token || tokens.access_token;
  if (!revokeToken) throw Error("Apple token required");
  const revoked = await fetcher("https://appleid.apple.com/auth/revoke", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: secret,
      token: revokeToken,
      token_type_hint: tokens.refresh_token ? "refresh_token" : "access_token",
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!revoked.ok) throw Error("Apple revocation incomplete");
}
