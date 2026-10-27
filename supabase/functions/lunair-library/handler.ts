import {
  allowedOrigin,
  InputError,
  newToken,
  normalizeEmail,
  privateHash,
  tokenHash,
} from "../_shared/lunair/core.ts";
import {
  boundedBody,
  type Config,
  json,
  listPacks,
  retryMagicDelivery,
  type Store,
} from "../_shared/lunair/service.ts";
const ACCEPTED = {
  message: "If this email owns a Lunair pack, a library link is on its way.",
};
export function makeLibraryHandler(
  deps: {
    config: Config;
    store: Store;
    deliver: (id: string) => Promise<void>;
    background: (work: Promise<unknown>) => void;
  },
) {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get("origin");
    if (!allowedOrigin(origin, deps.config.origins)) {
      return json({ error: "Origin is not allowed." }, 403);
    }
    const cors = {
      "access-control-allow-origin": origin!,
      "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "POST, OPTIONS",
      vary: "Origin",
    };
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (req.method !== "POST") {
      return json({ error: "Method not allowed." }, 405, {
        ...cors,
        allow: "POST, OPTIONS",
      });
    }
    const respond = (body: unknown, status = 200) => json(body, status, cors);
    try {
      if (!req.headers.get("content-type")?.startsWith("application/json")) {
        return respond({ error: "Use a JSON request." }, 400);
      }
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(await boundedBody(req, 4096));
        if (!body || Array.isArray(body) || typeof body !== "object") {
          throw new Error();
        }
      } catch {
        return respond({ error: "Invalid request." }, 400);
      }
      // Gateway-supplied IP is an additional throttle, not authentication. A global cap
      // and per-email caps still hold if a client can influence forwarded headers.
      const ip = req.headers.get("cf-connecting-ip") ||
        req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
      const ipHash = await privateHash(`ip:${ip}`, deps.config.pepper);
      const rate = (key: string, limit: number, seconds: number) =>
        deps.store.rpc("lunair_take_rate", {
          p_key: key,
          p_limit: limit,
          p_seconds: seconds,
        });
      if (
        !await rate(`ip:${ipHash}`, 60, 3600) ||
        !await rate("global:api", 3000, 3600)
      ) return respond({ error: "Too many requests. Try again later." }, 429);
      if (body.action === "request_link") {
        const email = normalizeEmail(body.email);
        const resume = (id: string) =>
          deps.background(
            retryMagicDelivery(id, deps.deliver).catch(() => {
              console.error("lunair_magic_delivery_pending");
            }),
          );
        const pending = await deps.store.rpc("lunair_pending_magic", {
          p_email: email,
        });
        // Recover a durable job before consuming a new email allowance or
        // issuing another token. Global and IP API limits still apply.
        if (typeof pending === "string") {
          resume(pending);
          return respond(ACCEPTED, 202);
        }
        const emailHash = await privateHash(
          `email:${email}`,
          deps.config.pepper,
        );
        if (
          !await rate(`email:${emailHash}`, 3, 3600) ||
          !await rate("global:email", 200, 3600)
        ) return respond(ACCEPTED, 202);
        const token = newToken();
        const hash = await tokenHash(token, "magic", deps.config.pepper);
        const link = `${deps.config.siteOrigin}/lunair/library/#token=${token}`;
        const id = await deps.store.rpc("lunair_queue_magic", {
          p_email: email,
          p_hash: hash,
          p_subject: "Your Lunair library link",
          p_body:
            `Open your Lunair library:\n${link}\n\nThis link expires in 15 minutes and works once. If you did not request it, you can ignore this email.\n`,
        });
        if (typeof id === "string") {
          resume(id);
        }
        return respond(ACCEPTED, 202);
      }
      if (body.action === "redeem") {
        if (
          typeof body.token !== "string" ||
          !/^[A-Za-z0-9_-]{43}$/.test(body.token)
        ) {
          return respond(
            { error: "This library link is invalid or expired." },
            401,
          );
        }
        const accessToken = newToken();
        const auth = await deps.store.rpc("lunair_redeem_magic", {
          p_hash: await tokenHash(body.token, "magic", deps.config.pepper),
          p_access_hash: await tokenHash(
            accessToken,
            "access",
            deps.config.pepper,
          ),
        }) as { email: string; expiresAt: string } | null;
        if (!auth) {
          return respond({
            error:
              "This library link is invalid or expired. Request a new link.",
          }, 401);
        }
        return respond({
          accessToken,
          expiresAt: auth.expiresAt,
        });
      }
      if (body.action === "list") {
        const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(
          req.headers.get("authorization") || "",
        )?.[1];
        if (!token) {
          return respond({
            error: "Your library session has expired. Request a new link.",
          }, 401);
        }
        const auth = await deps.store.rpc("lunair_get_access", {
          p_hash: await tokenHash(token, "access", deps.config.pepper),
        }) as { email: string; expiresAt: string } | null;
        if (!auth) {
          return respond({
            error: "Your library session has expired. Request a new link.",
          }, 401);
        }
        return respond({
          expiresAt: auth.expiresAt,
          ...await listPacks(auth.email, deps.store),
        });
      }
      return respond({ error: "Unknown action." }, 400);
    } catch (error) {
      if (error instanceof InputError) {
        return respond({ error: error.message }, 400);
      }
      console.error("lunair_library_unavailable");
      return respond({
        error: "The library is temporarily unavailable. Please try again.",
      }, 503);
    }
  };
}
