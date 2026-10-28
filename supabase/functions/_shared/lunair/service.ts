import {
  BUCKET,
  type Catalog,
  DOWNLOAD_SECONDS,
  InputError,
  ownedPacks,
  packTitle,
  VOL1_PATH,
} from "./core.ts";

export type Config = {
  stripeKey: string;
  webhookSecret: string;
  pepper: string;
  siteOrigin: string;
  origins: string[];
  supabaseUrl: string;
  serviceKey: string;
  resendKey: string;
  emailFrom: string;
  catalog: Catalog;
};
export interface Store {
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
  signedDownload(path: string, seconds: number): Promise<string>;
}
export type Mail = {
  from: string;
  to: string[];
  subject: string;
  text: string;
};
export type SendMail = (mail: Mail, idempotencyKey: string) => Promise<string>;
export class DeliveryError extends Error {
  constructor(message: string, public retryable: boolean) {
    super(message);
  }
}
export async function retryMagicDelivery(
  id: string,
  deliver: (id: string) => Promise<void>,
  wait: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<void> {
  const delays = [1000, 3000];
  for (let attempt = 0;; attempt++) {
    try {
      await deliver(id);
      return;
    } catch (error) {
      if (
        attempt >= delays.length ||
        (error instanceof DeliveryError && !error.retryable)
      ) throw error;
      await wait(delays[attempt]);
    }
  }
}
export function readConfig(env: (name: string) => string | undefined): Config {
  const required = (name: string) => {
    const value = env(name)?.trim();
    if (!value) throw new Error(`Missing ${name}`);
    return value;
  };
  const siteOrigin = env("LUNAIR_SITE_ORIGIN") || "https://meetbookish.com";
  const parsedSiteOrigin = new URL(siteOrigin);
  if (
    parsedSiteOrigin.origin !== siteOrigin ||
    (parsedSiteOrigin.protocol !== "https:" &&
      !(parsedSiteOrigin.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(parsedSiteOrigin.hostname)))
  ) throw new Error("Invalid site origin");
  const supabaseUrl = required("SUPABASE_URL");
  // Hard isolation guard. This implementation is test-only, including library access.
  if (supabaseUrl !== "https://txpdaqqjuavxpjsjrztq.supabase.co") {
    throw new Error("Lunair requires the approved test project");
  }
  const pepper = required("LUNAIR_TOKEN_PEPPER");
  if (pepper.length < 32) throw new Error("Invalid token pepper");
  const origins = [
    siteOrigin,
    ...(env("LUNAIR_EXTRA_ORIGINS") || "").split(",").map((v) => v.trim())
      .filter(Boolean),
  ];
  for (const origin of origins) {
    const parsed = new URL(origin);
    if (
      parsed.origin !== origin ||
      (parsed.protocol !== "https:" &&
        !(parsed.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(parsed.hostname)))
    ) throw new Error("Invalid allowed origin");
  }
  return {
    stripeKey: env("LUNAIR_STRIPE_TEST_SECRET_KEY") ||
      env("STRIPE_SECRET_KEY") || "",
    webhookSecret: env("LUNAIR_STRIPE_WEBHOOK_SECRET") || "",
    pepper,
    siteOrigin,
    origins,
    supabaseUrl,
    serviceKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    resendKey: required("RESEND_API_KEY"),
    emailFrom: required("LUNAIR_EMAIL_FROM"),
    catalog: {
      vol1: {
        price: env("LUNAIR_VOL1_PRICE_ID") || "",
        product: env("LUNAIR_VOL1_PRODUCT_ID") || "",
        amount: 900,
      },
      grimoire: {
        price: env("LUNAIR_GRIMOIRE_PRICE_ID") || "",
        product: env("LUNAIR_GRIMOIRE_PRODUCT_ID") || "",
        amount: 1900,
      },
    },
  };
}
export function createStore(
  config: Config,
  transport: typeof fetch = fetch,
): Store {
  async function call(path: string, body: unknown): Promise<unknown> {
    const response = await transport(`${config.supabaseUrl}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.serviceKey}`,
        apikey: config.serviceKey,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Storage or database request failed");
    return await response.json();
  }
  return {
    rpc: (name, args) => call(`/rest/v1/rpc/${name}`, args),
    signedDownload: async (path, seconds) => {
      if (!/^packs\/[a-z0-9]+(?:-[a-z0-9]+)*\.zip$/.test(path)) {
        throw new Error("Invalid pack path");
      }
      const result = await call(`/storage/v1/object/sign/${BUCKET}/${path}`, {
        expiresIn: seconds,
      }) as { signedURL?: string };
      if (!result.signedURL) throw new Error("Missing signed URL");
      const url = new URL(
        `${config.supabaseUrl}/storage/v1${result.signedURL}`,
      );
      if (
        url.origin !== config.supabaseUrl ||
        !url.pathname.startsWith(`/storage/v1/object/sign/${BUCKET}/packs/`)
      ) throw new Error("Invalid signed URL");
      url.searchParams.set("download", path.slice(6));
      return url.toString();
    },
  };
}
export function resendSender(
  config: Config,
  transport: typeof fetch = fetch,
): SendMail {
  return async (mail, idempotencyKey) => {
    const response = await transport("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.resendKey}`,
        "content-type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(mail),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      throw new DeliveryError(
        "Email provider did not accept delivery",
        response.status === 408 || response.status === 429 ||
          response.status >= 500,
      );
    }
    const result = await response.json();
    if (typeof result.id !== "string") {
      throw new Error("Email provider acknowledgement missing");
    }
    return result.id;
  };
}
export async function listPacks(email: string, store: Store) {
  const result = await store.rpc("lunair_owned_packs", { p_email: email }) as {
    paths: string[];
    grimoire: boolean;
  };
  // Defense in depth: normalize allowed object paths after the SQL entitlement filter.
  const paths = ownedPacks(
    result.grimoire ? ["grimoire"] : ["vol1"],
    result.paths,
  );
  const expiresAt = new Date(Date.now() + DOWNLOAD_SECONDS * 1000)
    .toISOString();
  const packs = await Promise.all(paths.map(async (path) => ({
    id: path.slice(6, -4),
    title: packTitle(path),
    downloadUrl: await store.signedDownload(path, DOWNLOAD_SECONDS),
    expiresAt,
  })));
  return { packs, grimoire: result.grimoire };
}
export async function deliverEmail(
  id: string,
  config: Config,
  store: Store,
  send: SendMail,
): Promise<void> {
  const lease = crypto.randomUUID();
  const delivery = await store.rpc("lunair_claim_email", {
    p_id: id,
    p_lease: lease,
  }) as {
    state: string;
    email: string;
    kind: string;
    product: string;
    subject: string | null;
    body: string | null;
  };
  if (delivery.state === "sent" || delivery.state === "expired") return;
  if (delivery.state !== "claimed") {
    throw new DeliveryError(
      "Delivery awaits retry or manual review",
      delivery.state === "busy",
    );
  }
  try {
    let subject = delivery.subject, body = delivery.body;
    if (!subject || !body) {
      const purchased = delivery.product === "grimoire"
        ? "The Grimoire"
        : "Spells for Grown-Ups, Vol. 1";
      // Every purchase currently includes Vol. 1. A missing ZIP leaves delivery pending.
      const download = await store.signedDownload(VOL1_PATH, 86400);
      subject = `Your Lunair test purchase: ${purchased}`;
      body =
        `Thank you for your test purchase of ${purchased}. No real payment was taken.\n\nDownload Spells for Grown-Ups, Vol. 1 (expires in 24 hours):\n${download}\n\nYour library: ${config.siteOrigin}/lunair/library/\nEnter the email you used at checkout to request a fresh library link.\n${
          delivery.product === "grimoire"
            ? "The Grimoire gives you lifetime access to every current and future pack, plus a wallpaper each new moon. It is a one-time purchase, with no subscription.\n"
            : ""
        }\n(c) Fictora. Personal use only. No resale or reuploading.\n`;
    }
    const payload = await store.rpc("lunair_prepare_email", {
      p_id: id,
      p_lease: lease,
      p_subject: subject,
      p_body: body,
    }) as { subject: string; body: string };
    const providerId = await send({
      from: config.emailFrom,
      to: [delivery.email],
      subject: payload.subject,
      text: payload.body,
    }, `lunair/${id}`);
    await store.rpc("lunair_finish_email", {
      p_id: id,
      p_lease: lease,
      p_provider_id: providerId,
    });
  } catch (error) {
    await store.rpc("lunair_release_email", {
      p_id: id,
      p_lease: lease,
      p_terminal: error instanceof DeliveryError && !error.retryable,
    }).catch(
      () => undefined,
    );
    if (error instanceof DeliveryError) throw error;
    throw new DeliveryError("Delivery remains pending", true);
  }
}
export function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      ...headers,
    },
  });
}
export async function boundedBody(
  req: Request,
  bytes: number,
): Promise<string> {
  if (Number(req.headers.get("content-length")) > bytes) {
    throw new InputError("Request is too large.");
  }
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > bytes) {
      await reader.cancel();
      throw new InputError("Request is too large.");
    }
    chunks.push(value);
  }
  const all = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(all);
}
