import Stripe from "npm:stripe@14.21.0";
import { assertTestKey } from "../_shared/lunair/core.ts";
import {
  createStore,
  deliverEmail,
  json,
  readConfig,
  resendSender,
} from "../_shared/lunair/service.ts";
import { makeWebhookHandler, stripeVerifier } from "./handler.ts";

Deno.serve(async (req) => {
  try {
    const config = readConfig((name) => Deno.env.get(name));
    assertTestKey(config.stripeKey);
    for (const product of Object.values(config.catalog)) {
      if (
        !product.price.startsWith("price_") ||
        !product.product.startsWith("prod_")
      ) throw new Error("Catalog missing");
    }
    const stripe = new Stripe(config.stripeKey, {
      apiVersion: "2023-10-16",
      httpClient: Stripe.createFetchHttpClient(),
      timeout: 10000,
      maxNetworkRetries: 1,
    });
    const store = createStore(config);
    const handler = makeWebhookHandler({
      config,
      store,
      verifyEvent: stripeVerifier(config),
      retrieveSession: (id) => stripe.checkout.sessions.retrieve(id),
      lineItems: async (id) => {
        const data: Stripe.LineItem[] = [];
        for await (
          const item of stripe.checkout.sessions.listLineItems(id, {
            limit: 100,
          })
        ) {
          if (data.length >= 1000) {
            throw new Error("Checkout line-item limit exceeded");
          }
          data.push(item);
        }
        return { data, has_more: false };
      },
      deliver: (id) => deliverEmail(id, config, store, resendSender(config)),
    });
    return await handler(req);
  } catch {
    console.error("lunair_webhook_configuration_unavailable");
    return json({ error: "Test checkout delivery is unavailable." }, 503);
  }
});
