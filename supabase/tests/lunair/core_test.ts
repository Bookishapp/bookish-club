import {
  assert,
  assertEquals,
  assertRejects,
  assertThrows,
} from "jsr:@std/assert@1.0.14";
import {
  allowedOrigin,
  assertTestKey,
  normalizeEmail,
  ownedPacks,
  tokenHash,
  validatePurchase,
} from "../../functions/_shared/lunair/core.ts";

const catalog = {
  vol1: { price: "price_vol1", product: "prod_vol1", amount: 900 },
  grimoire: { price: "price_grimoire", product: "prod_grimoire", amount: 1900 },
};
function checkout() {
  return {
    id: "cs_test_123",
    livemode: false,
    mode: "payment",
    status: "complete",
    payment_status: "paid",
    currency: "usd",
    amount_subtotal: 900,
    amount_total: 900,
    total_details: { amount_discount: 0, amount_tax: 0, amount_shipping: 0 },
    customer_details: { email: " Buyer@Example.com " },
  };
}
function items() {
  return {
    has_more: false,
    data: [{
      quantity: 1,
      amount_subtotal: 900,
      amount_total: 900,
      currency: "usd",
      price: {
        id: "price_vol1",
        product: "prod_vol1",
        livemode: false,
        type: "one_time",
        currency: "usd",
        unit_amount: 900,
      },
    }],
  };
}
Deno.test("actual paid line item determines ownership, not client metadata", () => {
  assertEquals(validatePurchase(checkout(), items(), catalog), {
    email: "buyer@example.com",
    product: "vol1",
    sessionId: "cs_test_123",
    priceId: "price_vol1",
    amount: 900,
  });
});
Deno.test("Stripe no-shipping null is accepted for a digital checkout", () => {
  assertEquals(
    validatePurchase(
      {
        ...checkout(),
        total_details: {
          amount_discount: 0,
          amount_tax: 0,
          amount_shipping: null,
        },
      },
      items(),
      catalog,
    ).product,
    "vol1",
  );
});
Deno.test("payment validation rejects live, unpaid, wrong amount, and subscriptions", () => {
  for (
    const patch of [
      { livemode: true },
      { payment_status: "unpaid" },
      { mode: "subscription" },
      { status: "open" },
      { amount_total: 899 },
      { currency: "eur" },
      { amount_subtotal: 899 },
      { id: "cs_live_123" },
      {
        total_details: {
          amount_discount: 1,
          amount_tax: 0,
          amount_shipping: 0,
        },
      },
    ]
  ) {
    assertThrows(() =>
      validatePurchase({ ...checkout(), ...patch }, items(), catalog)
    );
  }
});
Deno.test("line item mismatch, extra items, quantity, and recurring prices are rejected", () => {
  for (
    const patch of [
      { id: "price_other" },
      { product: "prod_other" },
      { livemode: true },
      { type: "recurring" },
      { unit_amount: 1 },
      { currency: "eur" },
    ]
  ) {
    const fixture = items();
    Object.assign(fixture.data[0].price, patch);
    assertThrows(() => validatePurchase(checkout(), fixture, catalog));
  }
  for (
    const patch of [{ quantity: 2 }, { amount_total: 1 }, { currency: "eur" }]
  ) {
    const fixture = items();
    Object.assign(fixture.data[0], patch);
    assertThrows(() => validatePurchase(checkout(), fixture, catalog));
  }
  assertThrows(() =>
    validatePurchase(checkout(), { ...items(), has_more: true }, catalog)
  );
  assertThrows(() =>
    validatePurchase(checkout(), {
      data: [...items().data, ...items().data],
      has_more: false,
    }, catalog)
  );
});
Deno.test("Grimoire is a one-time $19 entitlement", () => {
  const session = { ...checkout(), amount_total: 1900, amount_subtotal: 1900 };
  const fixture = items();
  Object.assign(fixture.data[0], { amount_subtotal: 1900, amount_total: 1900 });
  Object.assign(fixture.data[0].price, {
    id: "price_grimoire",
    product: "prod_grimoire",
    unit_amount: 1900,
  });
  assertEquals(validatePurchase(session, fixture, catalog).product, "grimoire");
});
Deno.test("email validation rejects injection, ambiguous whitespace, and invalid addresses", () => {
  assertEquals(normalizeEmail(" A.B+tag@Example.COM "), "a.b+tag@example.com");
  for (
    const input of [
      "a\r\nb@example.com",
      "a b@example.com",
      "a@localhost",
      "a@@example.com",
      "",
      null,
      "a..b@example.com",
    ]
  ) {
    assertThrows(() => normalizeEmail(input));
  }
});
Deno.test("test secret guard never accepts live or missing keys", () => {
  assertTestKey("sk_test_fixture");
  assertTestKey("rk_test_fixture");
  for (
    const key of ["sk_live_fixture", "rk_live_fixture", "", "whsec_fixture"]
  ) {
    assertThrows(() => assertTestKey(key));
  }
});
Deno.test("ownership never expands Vol. 1, and Grimoire sees future valid pack uploads", () => {
  const files = [
    "packs/spells-for-grown-ups-vol-1.zip",
    "packs/future-new-moon.zip",
    "draft.zip",
    "packs/../private.zip",
    "packs/nested/secret.zip",
  ];
  assertEquals(ownedPacks(["vol1"], files), [
    "packs/spells-for-grown-ups-vol-1.zip",
  ]);
  assertEquals(ownedPacks(["grimoire"], files), files.slice(0, 2));
  assertEquals(ownedPacks([], files), []);
});
Deno.test("CORS accepts only exact configured origins", () => {
  assert(allowedOrigin("https://meetbookish.com", ["https://meetbookish.com"]));
  for (
    const origin of [
      null,
      "https://meetbookish.com.evil.test",
      "null",
      "http://meetbookish.com",
      "https://meetbookish.com/",
    ]
  ) {
    assert(!allowedOrigin(origin, ["https://meetbookish.com"]));
  }
});
Deno.test("tokens are hashed with a secret pepper and purpose separation", async () => {
  const token = "A".repeat(43);
  const pepper = "secret".repeat(8);
  const hash = await tokenHash(token, "magic", pepper);
  assertEquals(hash.length, 64);
  assert(hash !== await tokenHash(token, "access", pepper));
  assert(hash !== await tokenHash(token, "magic", "different".repeat(8)));
  await assertRejects(() => tokenHash("short", "magic", pepper));
});
