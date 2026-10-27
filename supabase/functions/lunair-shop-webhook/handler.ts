import Stripe from "npm:stripe@14.21.0";
import {
  assertTestKey,
  InputError,
  validatePurchase,
} from "../_shared/lunair/core.ts";
import {
  boundedBody,
  type Config,
  json,
  type Store,
} from "../_shared/lunair/service.ts";

type Event = {
  id: string;
  type: string;
  livemode: boolean;
  data: { object: { id: string } };
};
export function stripeVerifier(config: Config) {
  assertTestKey(config.stripeKey);
  if (!config.webhookSecret.startsWith("whsec_")) {
    throw new Error("Webhook secret missing");
  }
  const stripe = new Stripe(config.stripeKey, {
    apiVersion: "2023-10-16",
    httpClient: Stripe.createFetchHttpClient(),
  });
  return (raw: string, signature: string) =>
    stripe.webhooks.constructEventAsync(
      raw,
      signature,
      config.webhookSecret,
      300,
      Stripe.createSubtleCryptoProvider(),
    ) as Promise<Event>;
}
export function makeWebhookHandler(deps: {
  config: Config;
  verifyEvent: (raw: string, signature: string) => Promise<Event>;
  retrieveSession: (
    id: string,
  ) => Promise<Parameters<typeof validatePurchase>[0]>;
  lineItems: (id: string) => Promise<Parameters<typeof validatePurchase>[1]>;
  store: Store;
  deliver: (id: string) => Promise<void>;
}) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed." }, 405, { allow: "POST" });
    }
    let event: Event;
    try {
      const signature = req.headers.get("stripe-signature");
      if (!signature) throw new Error("Missing signature");
      event = await deps.verifyEvent(await boundedBody(req, 262144), signature);
      if (event.livemode !== false) throw new Error("Live events are disabled");
    } catch {
      return json({ error: "Invalid test webhook." }, 400);
    }
    if (
      ![
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
      ].includes(event.type)
    ) return json({ received: true });
    try {
      assertTestKey(deps.config.stripeKey);
      if (!event.data.object.id?.startsWith("cs_test_")) {
        throw new InputError("Invalid test session.");
      }
      const session = await deps.retrieveSession(event.data.object.id);
      if (
        session.id !== event.data.object.id || session.livemode !== false ||
        session.status !== "complete"
      ) {
        throw new InputError("Session mismatch.");
      }
      const items = await deps.lineItems(session.id);
      if (items.has_more) throw new Error("Incomplete line items");
      const catalog = Object.values(deps.config.catalog);
      const includesLunair = items.data.some(({ price }) => {
        if (!price) return false;
        const product = typeof price.product === "string"
          ? price.product
          : price.product.id;
        return catalog.some((known) =>
          price.id === known.price || product === known.product
        );
      });
      // This account also serves Fictora. Unrelated authenticated test sessions
      // are acknowledged without granting entitlements or causing retry noise.
      if (!includesLunair) return json({ received: true, ignored: true });
      // A completed delayed payment is acknowledged, then fulfilled on async_payment_succeeded.
      if (
        session.payment_status === "unpaid" &&
        event.type === "checkout.session.completed"
      ) return json({ received: true, pending: true });
      const purchase = validatePurchase(
        session,
        items,
        deps.config.catalog,
      );
      const id = await deps.store.rpc("lunair_record_purchase", {
        p_email: purchase.email,
        p_product: purchase.product,
        p_session: purchase.sessionId,
        p_event: event.id,
        p_price: purchase.priceId,
        p_amount: purchase.amount,
      });
      if (typeof id !== "string") throw new Error("Purchase record failed");
      await deps.deliver(id);
      return json({ received: true });
    } catch (error) {
      if (error instanceof InputError) {
        return json({ error: "Ineligible test checkout." }, 400);
      }
      // Never log email addresses, tokens, payloads, provider responses, or secrets.
      console.error("lunair_webhook_processing_pending");
      return json({ error: "Delivery is pending. Retry this event." }, 503);
    }
  };
}
