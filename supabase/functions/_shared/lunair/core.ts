export type Product = "vol1" | "grimoire";
export type Catalog = Record<
  Product,
  { price: string; product: string; amount: number }
>;
export type Purchase = {
  email: string;
  product: Product;
  sessionId: string;
  priceId: string;
  amount: number;
};
export const BUCKET = "lunair-packs-test";
export const VOL1_PATH = "packs/spells-for-grown-ups-vol-1.zip";
export const MAGIC_SECONDS = 900;
export const ACCESS_SECONDS = 3600;
export const DOWNLOAD_SECONDS = 900;

export class InputError extends Error {}
export function normalizeEmail(value: unknown): string {
  if (typeof value !== "string" || /[\r\n]/.test(value)) {
    throw new InputError("Enter a valid email address.");
  }
  const email = value.trim().toLowerCase();
  const parts = email.split("@");
  if (
    email.length > 254 || parts.length !== 2 || parts[0].length > 64 ||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/
      .test(email) ||
    parts[0].startsWith(".") || parts[0].endsWith(".") ||
    parts[0].includes("..")
  ) {
    throw new InputError("Enter a valid email address.");
  }
  return email;
}
export function assertTestKey(key: string): void {
  if (!/^(sk|rk)_test_[A-Za-z0-9_]+$/.test(key)) {
    throw new Error("A Stripe test key is required.");
  }
}
type Checkout = {
  id: string;
  livemode: boolean;
  mode: string | null;
  status: string | null;
  payment_status: string;
  currency: string | null;
  amount_total: number | null;
  amount_subtotal: number | null;
  customer_details: { email: string | null } | null;
  total_details: {
    amount_discount: number;
    amount_tax: number;
    amount_shipping: number | null;
  } | null;
};
type LineItems = {
  has_more: boolean;
  data: Array<{
    quantity: number | null;
    amount_total: number;
    amount_subtotal: number;
    currency: string;
    price: {
      id: string;
      product: string | { id: string };
      livemode: boolean;
      type: string;
      currency: string;
      unit_amount: number | null;
    } | null;
  }>;
};
export function validatePurchase(
  session: Checkout,
  items: LineItems,
  catalog: Catalog,
): Purchase {
  const fail = () => {
    throw new InputError("Checkout is not an eligible test purchase.");
  };
  if (
    session.livemode !== false || !session.id.startsWith("cs_test_") ||
    session.mode !== "payment" ||
    session.status !== "complete" || session.payment_status !== "paid" ||
    session.currency !== "usd" ||
    !session.total_details || session.total_details.amount_discount !== 0 ||
    session.total_details.amount_tax !== 0 ||
    (session.total_details.amount_shipping ?? 0) !== 0 ||
    items.has_more || items.data.length !== 1
  ) fail();
  const item = items.data[0];
  const price = item?.price;
  if (
    !price || price.livemode !== false || price.type !== "one_time" ||
    price.currency !== "usd" || item.currency !== "usd" || item.quantity !== 1
  ) return fail();
  const productId = typeof price.product === "string"
    ? price.product
    : price.product.id;
  const product = (Object.keys(catalog) as Product[]).find((key) => {
    const expected = catalog[key];
    return price.id === expected.price && productId === expected.product &&
      price.unit_amount === expected.amount &&
      item.amount_total === expected.amount &&
      item.amount_subtotal === expected.amount &&
      session.amount_total === expected.amount &&
      session.amount_subtotal === expected.amount;
  });
  if (!product) return fail();
  return {
    email: normalizeEmail(session.customer_details?.email),
    product,
    sessionId: session.id,
    priceId: price.id,
    amount: catalog[product].amount,
  };
}
export function ownedPacks(products: string[], paths: string[]): string[] {
  return [...new Set(paths)].filter((path) =>
    /^packs\/[a-z0-9]+(?:-[a-z0-9]+)*\.zip$/.test(path)
  )
    .filter((path) =>
      products.includes("grimoire") ||
      (products.includes("vol1") && path === VOL1_PATH)
    );
}
export function packTitle(path: string): string {
  if (path === VOL1_PATH) return "Spells for Grown-Ups, Vol. 1";
  return path.slice(6, -4).split("-").map((part) =>
    part[0].toUpperCase() + part.slice(1)
  ).join(" ");
}
export function allowedOrigin(
  origin: string | null,
  origins: string[],
): boolean {
  return origin !== null && origins.includes(origin);
}
export function newToken(): string {
  return btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
  )
    .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
export async function privateHash(
  value: string,
  pepper: string,
): Promise<string> {
  if (pepper.length < 32) throw new Error("Token pepper is not configured.");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(
    new Uint8Array(bytes),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}
export function tokenHash(
  token: string,
  purpose: "magic" | "access",
  pepper: string,
): Promise<string> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return Promise.reject(
      new InputError("This library link is invalid or expired."),
    );
  }
  return privateHash(`${purpose}:${token}`, pepper);
}
