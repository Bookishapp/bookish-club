// Async fakes preserve the production I/O boundary without using real services.
// deno-lint-ignore-file require-await
import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";
import { createHmac } from "node:crypto";
const sign = (
  { payload, secret, timestamp = Math.floor(Date.now() / 1000) }: {
    payload: string;
    secret: string;
    timestamp?: number;
  },
) =>
  `t=${timestamp},v1=${
    createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex")
  }`;
import {
  makeWebhookHandler,
  stripeVerifier,
} from "../../functions/lunair-shop-webhook/handler.ts";
import { makeLibraryHandler } from "../../functions/lunair-library/handler.ts";
import {
  deliverEmail,
  type Store,
} from "../../functions/_shared/lunair/service.ts";

const config = {
  stripeKey: "sk_test_fixture",
  webhookSecret: "whsec_fixture",
  pepper: "fixture-secret".repeat(4),
  siteOrigin: "https://meetbookish.com",
  origins: ["https://meetbookish.com"],
  supabaseUrl: "https://test.supabase.co",
  serviceKey: "fixture",
  resendKey: "fixture",
  emailFrom: "Lunair <noreply@fictora.co>",
  catalog: {
    vol1: { price: "price_vol1", product: "prod_vol1", amount: 900 },
    grimoire: {
      price: "price_grimoire",
      product: "prod_grimoire",
      amount: 1900,
    },
  },
};
const session = {
  id: "cs_test_123",
  livemode: false,
  mode: "payment",
  status: "complete",
  payment_status: "paid",
  currency: "usd",
  amount_subtotal: 900,
  amount_total: 900,
  total_details: { amount_discount: 0, amount_tax: 0, amount_shipping: 0 },
  customer_details: { email: "buyer@example.com" },
};
const lineItems = {
  has_more: false,
  data: [{
    quantity: 1,
    amount_total: 900,
    amount_subtotal: 900,
    currency: "usd",
    price: {
      id: "price_vol1",
      product: "prod_vol1",
      type: "one_time",
      livemode: false,
      currency: "usd",
      unit_amount: 900,
    },
  }],
};
const store = (rpc: Store["rpc"]): Store => ({
  rpc,
  signedDownload: (path) =>
    Promise.resolve(
      `https://test.supabase.co/storage/v1/object/sign/lunair-packs-test/${path}?token=fixture`,
    ),
});
function request(
  body: unknown,
  token?: string,
  origin = "https://meetbookish.com",
) {
  return new Request("https://test.supabase.co/functions/v1/lunair-library", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}
Deno.test("webhook verifies raw bytes before retrieving checkout or writing purchases", async () => {
  const verify = stripeVerifier(config);
  const raw = JSON.stringify({
    id: "evt_1",
    type: "checkout.session.completed",
    livemode: false,
    data: { object: { id: "cs_test_123" } },
  });
  const signature = sign({ payload: raw, secret: config.webhookSecret });
  let writes = 0, sends = 0, retrieves = 0;
  const handler = makeWebhookHandler({
    config,
    verifyEvent: verify,
    retrieveSession: async () => {
      retrieves++;
      return session;
    },
    lineItems: async () => lineItems,
    store: store(async (name, args) => {
      assertEquals(name, "lunair_record_purchase");
      assertEquals(args.p_email, "buyer@example.com");
      writes++;
      return "outbox-1";
    }),
    deliver: async () => {
      sends++;
    },
  });
  const post = (body: string, sig: string) =>
    handler(
      new Request("https://test/webhook", {
        method: "POST",
        headers: { "stripe-signature": sig },
        body,
      }),
    );
  assertEquals((await post(raw + " ", signature)).status, 400);
  assertEquals(writes, 0);
  assertEquals(retrieves, 0);
  assertEquals((await post(raw, signature)).status, 200);
  assertEquals(writes, 1);
  assertEquals(sends, 1);
  const live = raw.replace('"livemode":false', '"livemode":true');
  assertEquals(
    (await post(live, sign({ payload: live, secret: config.webhookSecret })))
      .status,
    400,
  );
  assertEquals(retrieves, 1);
  const old = sign({
    payload: raw,
    secret: config.webhookSecret,
    timestamp: Math.floor(Date.now() / 1000) - 600,
  });
  assertEquals((await post(raw, old)).status, 400);
});
Deno.test("webhook returns retryable failure if durable delivery does not complete", async () => {
  const handler = makeWebhookHandler({
    config,
    verifyEvent: async () => ({
      id: "evt_1",
      type: "checkout.session.completed",
      livemode: false,
      data: { object: { id: "cs_test_123" } },
    }),
    retrieveSession: async () => session,
    lineItems: async () => lineItems,
    store: store(async () => "outbox-1"),
    deliver: async () => {
      throw new Error("transport");
    },
  });
  assertEquals(
    (await handler(
      new Request("https://test/webhook", {
        method: "POST",
        headers: { "stripe-signature": "fixture" },
        body: "{}",
      }),
    )).status,
    503,
  );
});
Deno.test("library rejects hostile origins, malformed email, and unauthorized list", async () => {
  const handler = makeLibraryHandler({
    config,
    store: store(async () => true),
    deliver: async () => {},
    background: () => {},
  });
  assertEquals(
    (await handler(
      request(
        { action: "request_link", email: "a@example.com" },
        undefined,
        "https://meetbookish.com.evil.test",
      ),
    )).status,
    403,
  );
  assertEquals(
    (await handler(
      request({ action: "request_link", email: "a\r\nb@example.com" }),
    )).status,
    400,
  );
  assertEquals((await handler(request({ action: "list" }))).status, 401);
  assertEquals(
    (await handler(request({ action: "redeem", token: "short" }))).status,
    401,
  );
});
Deno.test("library returns identical responses for owned, unknown, and email-limited addresses", async () => {
  const responses = [];
  for (const scenario of ["owned", "unknown", "limited"]) {
    const handler = makeLibraryHandler({
      config,
      store: store(async (name, args) => {
        if (name === "lunair_take_rate") {
          return !(scenario === "limited" &&
            String(args.p_key).startsWith("email:"));
        }
        if (name === "lunair_pending_magic") return null;
        if (name === "lunair_queue_magic") {
          return scenario === "owned" ? "outbox-1" : null;
        }
        throw new Error(name);
      }),
      deliver: async () => {},
      background: () => {},
    });
    const response = await handler(
      request({ action: "request_link", email: "buyer@example.com" }),
    );
    responses.push({ status: response.status, body: await response.text() });
  }
  assertEquals(responses[0], responses[1]);
  assertEquals(responses[1], responses[2]);
  assertEquals(responses[0].status, 202);
});
Deno.test("library denies expired or used tokens, and returns only database-owned downloads", async () => {
  let valid = false;
  const handler = makeLibraryHandler({
    config,
    store: store(async (name) => {
      if (name === "lunair_take_rate") return true;
      if (name === "lunair_redeem_magic" || name === "lunair_get_access") {
        return valid
          ? { email: "buyer@example.com", expiresAt: "2099-01-01T00:00:00Z" }
          : null;
      }
      if (name === "lunair_owned_packs") {
        return {
          paths: ["packs/spells-for-grown-ups-vol-1.zip"],
          grimoire: false,
        };
      }
      throw new Error(name);
    }),
    deliver: async () => {},
    background: () => {},
  });
  assertEquals(
    (await handler(request({ action: "redeem", token: "A".repeat(43) })))
      .status,
    401,
  );
  valid = true;
  const response = await handler(
    request({ action: "redeem", token: "A".repeat(43) }),
  );
  const body = await response.json();
  assertEquals(response.status, 200);
  assertEquals(body.accessToken.length, 43);
  assertEquals(body.packs, undefined);
  const listing = await handler(request({ action: "list" }, body.accessToken));
  const library = await listing.json();
  assertEquals(library.packs.length, 1);
  assertEquals(library.grimoire, false);
  assertEquals(library.packs[0].title, "Spells for Grown-Ups, Vol. 1");
  assert(
    library.packs[0].downloadUrl.includes(
      "/object/sign/lunair-packs-test/packs/",
    ),
  );
  assertEquals(response.headers.get("cache-control"), "no-store");
});
Deno.test("outbox skips sent messages and preserves payload and provider idempotency on retry", async () => {
  let state = "sent", sends = 0, finished = false;
  const db = store(async (name) => {
    if (name === "lunair_claim_email") {
      return {
        state,
        email: "buyer@example.com",
        subject: "fixed",
        body: "fixed signed link",
        kind: "purchase",
        product: "vol1",
      };
    }
    if (name === "lunair_prepare_email") {
      return { subject: "fixed", body: "fixed signed link" };
    }
    if (name === "lunair_finish_email") {
      finished = true;
      return true;
    }
    throw new Error(name);
  });
  const send = async (
    payload: { subject: string; text: string },
    key: string,
  ) => {
    sends++;
    assertEquals(payload.text, "fixed signed link");
    assertEquals(key, "lunair/outbox-1");
    return "provider-1";
  };
  await deliverEmail("outbox-1", config, db, send);
  assertEquals(sends, 0);
  state = "claimed";
  await deliverEmail("outbox-1", config, db, send);
  assertEquals(sends, 1);
  assert(finished);
  state = "manual_review";
  await assertRejects(() => deliverEmail("outbox-1", config, db, send));
  assertEquals(sends, 1);
});

Deno.test("missing configuration and production project URLs fail closed", async () => {
  const { readConfig } = await import(
    "../../functions/_shared/lunair/service.ts"
  );
  const env: Record<string, string> = {
    SUPABASE_URL: "https://txpdaqqjuavxpjsjrztq.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "fixture",
    RESEND_API_KEY: "fixture",
    LUNAIR_EMAIL_FROM: "Lunair <noreply@fictora.co>",
    LUNAIR_TOKEN_PEPPER: "A".repeat(43),
  };
  for (const missing of Object.keys(env)) {
    let rejected = false;
    try {
      readConfig((name) => name === missing ? undefined : env[name]);
    } catch {
      rejected = true;
    }
    assert(rejected, `missing ${missing} must fail`);
  }
  let rejected = false;
  try {
    readConfig((name) =>
      name === "SUPABASE_URL"
        ? "https://wqnrortftkffmbeugjky.supabase.co"
        : env[name]
    );
  } catch {
    rejected = true;
  }
  assert(rejected);
});
Deno.test("REST adapters bind signed downloads and email delivery to fixed service origins", async () => {
  const { createStore, resendSender } = await import(
    "../../functions/_shared/lunair/service.ts"
  );
  const calls: Array<{ url: string; body: unknown; headers: Headers }> = [];
  const transport: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({
      url,
      body: JSON.parse(String(init?.body)),
      headers: new Headers(init?.headers),
    });
    return new Response(
      JSON.stringify(
        url.includes("resend.com") ? { id: "provider-123" } : {
          signedURL:
            "/object/sign/lunair-packs-test/packs/spells-for-grown-ups-vol-1.zip?token=signed",
        },
      ),
      { status: 200 },
    );
  };
  const db = createStore(config, transport);
  const url = await db.signedDownload(
    "packs/spells-for-grown-ups-vol-1.zip",
    900,
  );
  assertEquals(
    url,
    "https://test.supabase.co/storage/v1/object/sign/lunair-packs-test/packs/spells-for-grown-ups-vol-1.zip?token=signed&download=spells-for-grown-ups-vol-1.zip",
  );
  assertEquals(calls[0].body, { expiresIn: 900 });
  await assertRejects(() => db.signedDownload("../private.zip", 900));
  assertEquals(calls.length, 1);
  const send = resendSender(config, transport);
  assertEquals(
    await send({
      from: config.emailFrom,
      to: ["buyer@example.com"],
      subject: "fixture",
      text: "fixture",
    }, "lunair/outbox-123"),
    "provider-123",
  );
  assertEquals(calls[1].url, "https://api.resend.com/emails");
  assertEquals(calls[1].headers.get("idempotency-key"), "lunair/outbox-123");
});

Deno.test("redeemed session survives Storage failure and retries listing without another magic link", async () => {
  let consumed = false, signingFails = true, signed = 0;
  const db = store(async (name) => {
    if (name === "lunair_take_rate") return true;
    if (name === "lunair_redeem_magic") {
      if (consumed) return null;
      consumed = true;
      return { email: "buyer@example.com", expiresAt: "2099-01-01T00:00:00Z" };
    }
    if (name === "lunair_get_access") {
      return { email: "buyer@example.com", expiresAt: "2099-01-01T00:00:00Z" };
    }
    if (name === "lunair_owned_packs") {
      return {
        paths: ["packs/spells-for-grown-ups-vol-1.zip"],
        grimoire: false,
      };
    }
    throw new Error(name);
  });
  const signer = db.signedDownload;
  db.signedDownload = async (path, seconds) => {
    signed++;
    if (signingFails) throw new Error("Storage outage");
    return signer(path, seconds);
  };
  const handler = makeLibraryHandler({
    config,
    store: db,
    deliver: async () => {},
    background: () => {},
  });
  const redeem = await handler(
    request({ action: "redeem", token: "A".repeat(43) }),
  );
  assertEquals(redeem.status, 200);
  const auth = await redeem.json();
  assertEquals(auth.accessToken.length, 43);
  assertEquals(signed, 0, "authentication must not depend on Storage");
  assertEquals(
    (await handler(request({ action: "list" }, auth.accessToken))).status,
    503,
  );
  signingFails = false;
  const retry = await handler(request({ action: "list" }, auth.accessToken));
  assertEquals(retry.status, 200);
  assertEquals((await retry.json()).packs.length, 1);
  assertEquals(
    (await handler(request({ action: "redeem", token: "A".repeat(43) })))
      .status,
    401,
  );
});

Deno.test("shared Stripe account checkouts are ignored only when no Lunair product or price appears", async () => {
  let writes = 0;
  const invoke = async (items: typeof lineItems, checkout = session) => {
    const handler = makeWebhookHandler({
      config,
      verifyEvent: async () => ({
        id: "evt_other",
        type: "checkout.session.completed",
        livemode: false,
        data: { object: { id: session.id } },
      }),
      retrieveSession: async () => checkout,
      lineItems: async () => items,
      store: store(async () => {
        writes++;
        return "outbox";
      }),
      deliver: async () => {},
    });
    return handler(
      new Request("https://test/webhook", {
        method: "POST",
        headers: { "stripe-signature": "fixture" },
        body: "{}",
      }),
    );
  };
  const unrelated = structuredClone(lineItems);
  unrelated.data[0].price.id = "price_fictora";
  unrelated.data[0].price.product = "prod_fictora";
  unrelated.data[0].price.type = "recurring";
  const ignored = await invoke(unrelated, { ...session, mode: "subscription" });
  assertEquals(ignored.status, 200);
  assertEquals(await ignored.json(), { received: true, ignored: true });
  assertEquals(writes, 0);
  const wrongPrice = structuredClone(lineItems);
  wrongPrice.data[0].price.id = "price_wrong";
  assertEquals((await invoke(wrongPrice)).status, 400);
  const wrongProduct = structuredClone(lineItems);
  wrongProduct.data[0].price.product = "prod_wrong";
  assertEquals((await invoke(wrongProduct)).status, 400);
  assertEquals(
    (await invoke(lineItems, { ...session, amount_total: 899 })).status,
    400,
  );
  assertEquals(
    (await invoke({ ...unrelated, has_more: true })).status,
    503,
    "incomplete line-item pages cannot prove no Lunair ownership",
  );
  assertEquals(
    (await invoke(unrelated, { ...session, livemode: true })).status,
    400,
  );
  assertEquals(writes, 0);
});

Deno.test("magic email retries transient provider failures with the original payload and key", async () => {
  const { resendSender, retryMagicDelivery } = await import(
    "../../functions/_shared/lunair/service.ts"
  );
  const requests: Array<{ key: string | null; body: string }> = [];
  let released = 0, finished = 0;
  const db = store(async (name) => {
    if (name === "lunair_claim_email") {
      return {
        state: "claimed",
        kind: "magic",
        email: "buyer@example.com",
        subject: "fixed",
        body: "fixed magic link",
      };
    }
    if (name === "lunair_prepare_email") {
      return { subject: "fixed", body: "fixed magic link" };
    }
    if (name === "lunair_release_email") {
      released++;
      return true;
    }
    if (name === "lunair_finish_email") {
      finished++;
      return true;
    }
    throw new Error(name);
  });
  const sender = resendSender(config, async (_input, init) => {
    requests.push({
      key: new Headers(init?.headers).get("idempotency-key"),
      body: String(init?.body),
    });
    return new Response(
      JSON.stringify(
        requests.length < 3 ? { error: "temporary" } : { id: "provider-ok" },
      ),
      {
        status: requests.length === 1 ? 429 : requests.length === 2 ? 503 : 200,
      },
    );
  });
  const delays: number[] = [];
  await retryMagicDelivery(
    "original-id",
    (id) => deliverEmail(id, config, db, sender),
    async (ms) => {
      delays.push(ms);
    },
  );
  assertEquals(requests.length, 3);
  assertEquals(released, 2);
  assertEquals(finished, 1);
  assertEquals(delays, [1000, 3000]);
  assertEquals(requests[0], requests[1]);
  assertEquals(requests[1], requests[2]);
  assertEquals(requests[0].key, "lunair/original-id");
});
Deno.test("magic retry budget stops at three attempts and permanent provider errors stop immediately", async () => {
  const { resendSender, retryMagicDelivery } = await import(
    "../../functions/_shared/lunair/service.ts"
  );
  for (const status of [503, 422]) {
    let sends = 0;
    const sender = resendSender(config, async () => {
      sends++;
      return new Response("{}", { status });
    });
    await assertRejects(() =>
      retryMagicDelivery("id", async () => {
        await sender({
          from: config.emailFrom,
          to: ["buyer@example.com"],
          subject: "x",
          text: "x",
        }, "lunair/id");
      }, async () => {})
    );
    assertEquals(sends, status === 503 ? 3 : 1);
  }
});
Deno.test("request_link recovers an unfinished job without issuing a token or using another email allowance", async () => {
  let queued = 0, emailAllowances = 0, delivered: string | undefined;
  const background: Promise<unknown>[] = [];
  const handler = makeLibraryHandler({
    config,
    store: store(async (name, args) => {
      if (name === "lunair_take_rate") {
        if (String(args.p_key).startsWith("email:")) emailAllowances++;
        return true;
      }
      if (name === "lunair_pending_magic") return "unfinished-job";
      if (name === "lunair_queue_magic") {
        queued++;
        return "new-job";
      }
      throw new Error(name);
    }),
    deliver: async (id) => {
      delivered = id;
    },
    background: (work) => {
      background.push(work);
    },
  });
  const response = await handler(
    request({ action: "request_link", email: "buyer@example.com" }),
  );
  assertEquals(response.status, 202);
  await Promise.all(background);
  assertEquals(delivered, "unfinished-job");
  assertEquals(queued, 0);
  assertEquals(emailAllowances, 0);
});

Deno.test("accepted magic-link request retries its actual background delivery after a transient failure", async () => {
  let attempts = 0;
  const background: Promise<unknown>[] = [];
  const handler = makeLibraryHandler({
    config,
    store: store(async (name) => {
      if (name === "lunair_take_rate") return true;
      if (name === "lunair_pending_magic") return null;
      if (name === "lunair_queue_magic") return "pending-id";
      throw new Error(name);
    }),
    deliver: async (id) => {
      assertEquals(id, "pending-id");
      attempts++;
      if (attempts === 1) throw new Error("temporary transport failure");
    },
    background: (work) => {
      background.push(work);
    },
  });
  assertEquals(
    (await handler(
      request({ action: "request_link", email: "buyer@example.com" }),
    )).status,
    202,
  );
  await Promise.all(background);
  assertEquals(attempts, 2);
});
