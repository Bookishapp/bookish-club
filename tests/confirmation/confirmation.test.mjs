import { test } from "node:test";
import assert from "node:assert/strict";
import { edge, submission, confirmation, TOKEN, FROM } from "./harness.mjs";

test("submission sends through Vault credentials when runtime overrides are absent", async () => {
  const app = edge("bookish-submit", {
    env: { BOOKISH_EMAIL_FROM: undefined, RESEND_API_KEY: undefined },
    vault: { BOOKISH_EMAIL_FROM: FROM, RESEND_API_KEY: "offline-mail-placeholder" },
  });
  const response = await app.handler(submission());
  assert.deepEqual(await response.json(), { ok: true, confirm_sent: true });
  assert.equal(app.emails.length, 1);
  assert.equal(app.emails[0].from, FROM);
  assert.deepEqual(app.vaultReads.sort(), ["BOOKISH_EMAIL_FROM", "RESEND_API_KEY"]);
  assert.ok(app.rows[0].email_sent_at);
});

test("runtime email settings override different Vault values without a secret RPC", async () => {
  const app = edge("bookish-submit", {
    vault: { BOOKISH_EMAIL_FROM: "Wrong <wrong@example.test>", RESEND_API_KEY: "wrong-key" },
  });
  const response = await app.handler(submission());
  assert.deepEqual(await response.json(), { ok: true, confirm_sent: true });
  assert.equal(app.emails[0].from, FROM);
  assert.deepEqual(app.vaultReads, []);
});

test("confirmation redirect uses the dedicated Vault site configuration", async () => {
  const app = edge("bookish-confirm", {
    rows: [{ id: "match", confirm_token: TOKEN, status: "pending" }],
    vault: { BOOKISH_SITE_URL: "https://bookish.example.test" },
  });
  const response = await app.handler(confirmation(TOKEN));
  assert.equal(response.headers.get("location"), "https://bookish.example.test/confirmed/");
  assert.equal(app.rows[0].status, "confirmed");
  assert.deepEqual(app.vaultReads, ["BOOKISH_SITE_URL"]);
});

test("a denied Vault lookup preserves intake without sending or returning database details", async () => {
  const app = edge("bookish-submit", {
    env: { BOOKISH_EMAIL_FROM: undefined, RESEND_API_KEY: undefined },
    vaultStatus: 403,
  });
  const response = await app.handler(submission());
  assert.deepEqual(await response.json(), { ok: true, confirm_sent: false });
  assert.equal(app.rows.length, 1);
  assert.equal(app.emails.length, 0);
});

// Regressions caught: a missing credential must never enable delivery.
for (const [label, env] of [
  ["sender", { BOOKISH_EMAIL_FROM: undefined }],
  ["API key", { RESEND_API_KEY: undefined }],
  ["both credentials", { BOOKISH_EMAIL_FROM: "", RESEND_API_KEY: "" }],
]) test(`missing ${label} saves a pending submission without sending`, async () => {
  const app = edge("bookish-submit", { env });
  const response = await app.handler(submission());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, confirm_sent: false });
  assert.equal(app.emails.length, 0);
  assert.equal(app.rows.length, 1);
  assert.equal(app.rows[0].status, "pending");
  assert.equal(app.rows[0].email_sent_at, null);
});

// Regressions caught: wrong recipient, leaked token, omitted stamp, or premature confirmation.
for (const [kind, fields, phrase] of [
  ["claim", {}, "your claim for Reading Together"],
  ["start", { city: "Austin", state: "TX" }, "your new club, Reading Together"],
  ["waitlist", {}, "the host tools waitlist"],
]) test(`${kind} emails only the normalized submitter and remains pending until confirmation`, async () => {
  const app = edge("bookish-submit");
  const response = await app.handler(submission({ kind, ...fields }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, confirm_sent: true });
  assert.equal(app.emails.length, 1);
  const email = app.emails[0];
  assert.equal(email.from, FROM);
  assert.deepEqual(email.to, ["reader@example.test"]);
  assert.ok(email.subject.length > 0);
  assert.ok(!email.subject.includes("\u2014"));
  assert.ok(email.text.includes(phrase));
  assert.ok(email.text.includes("Hello Ada,"));
  assert.ok(email.text.includes(`https://database.example.test/functions/v1/bookish-confirm?token=${TOKEN}`));
  assert.equal(app.rows[0].status, "pending");
  assert.ok(Number.isFinite(Date.parse(app.rows[0].email_sent_at)));
});

// Regression caught: treating provider rejection as a successful send.
test("Resend 403 for a meetbookish.com sender keeps the saved row pending", async () => {
  const app = edge("bookish-submit", {
    mailStatus: 403, env: { BOOKISH_EMAIL_FROM: "Bookish <hello@meetbookish.com>" },
  });
  const response = await app.handler(submission());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, confirm_sent: false });
  assert.equal(app.emails.length, 1);
  assert.equal(app.emails[0].from, "Bookish <hello@meetbookish.com>");
  assert.equal(app.rows.length, 1);
  assert.equal(app.rows[0].status, "pending");
  assert.equal(app.rows[0].email_sent_at, null);
});

// Regression caught: an email transport failure must not fail an already saved submission.
test("a thrown Resend fetch returns success for the saved row without marking email sent", async () => {
  const app = edge("bookish-submit", { mailThrows: true });
  const response = await app.handler(submission());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, confirm_sent: false });
  assert.equal(app.emails.length, 1);
  assert.equal(app.rows.length, 1);
  assert.equal(app.rows[0].email, "reader@example.test");
  assert.equal(app.rows[0].status, "pending");
  assert.equal(app.rows[0].email_sent_at, null);
});

// Regression caught: sending a confirmation link before persistence succeeds.
test("failed persistence sends nothing and returns a generic server error", async () => {
  const app = edge("bookish-submit", { insertError: true });
  const response = await app.handler(submission());
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { ok: false, error: "server" });
  assert.equal(app.emails.length, 0);
  assert.equal(app.rows.length, 0);
});

// Regressions caught: bypassed consent, email validation, or origin gates.
for (const [label, fields, origin, status, error] of [
  ["missing consent", { consent: false }, "https://meetbookish.com", 400, "consent"],
  ["invalid email", { email: "invalid" }, "https://meetbookish.com", 400, "email"],
  ["untrusted origin", {}, "https://untrusted.example.test", 403, "origin"],
]) test(`${label} cannot persist or trigger email`, async () => {
  const app = edge("bookish-submit");
  const response = await app.handler(submission(fields, origin));
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), { ok: false, error });
  assert.equal(app.rows.length, 0);
  assert.equal(app.emails.length, 0);
});

for (const [label, fields] of [["honeypot", { website: "bot" }], ["fast fill", { elapsed_ms: 1 }]]) {
  test(`${label} silently stops before persistence and email`, async () => {
    const app = edge("bookish-submit");
    const response = await app.handler(submission(fields));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(app.rows.length, 0);
    assert.equal(app.emails.length, 0);
  });
}

// Regressions caught: a wrong rate-limit boundary or a send before the rate check.
for (const [label, count] of [["daily email", 3], ["hourly IP", 6]]) {
  test(`${label} limit rejects another submission without sending`, async () => {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("bookish:192.0.2.1"));
    const ipHash = Buffer.from(hash).toString("hex");
    const rows = Array.from({ length: count }, (_, index) => ({
      id: `existing-${index}`, kind: "claim", email: label === "daily email" ? "reader@example.test" : `other-${index}@example.test`,
      ip_hash: label === "hourly IP" ? ipHash : "another-ip", created_at: new Date().toISOString(),
    }));
    const app = edge("bookish-submit", { rows });
    const response = await app.handler(submission());
    assert.equal(response.status, 429);
    assert.deepEqual(await response.json(), { ok: false, error: "rate_limited" });
    assert.equal(app.rows.length, count);
    assert.equal(app.emails.length, 0);
  });
}

// Regressions caught: wrong token filter, redirect domain, or missing confirmation stamp.
test("a valid confirmation token confirms only its matching submission", async () => {
  const app = edge("bookish-confirm", { rows: [
    { id: "match", confirm_token: TOKEN, status: "pending" },
    { id: "other", confirm_token: "33333333-3333-4333-8333-333333333333", status: "pending" },
  ] });
  const response = await app.handler(confirmation(TOKEN));
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://meetbookish.com/confirmed/");
  assert.equal(app.rows[0].status, "confirmed");
  assert.ok(Number.isFinite(Date.parse(app.rows[0].confirmed_at)));
  assert.equal(app.rows[1].status, "pending");
  assert.equal(app.emails.length, 0);
});

for (const [label, token, status] of [
  ["missing", undefined, "pending"],
  ["malformed", "not-a-uuid", "pending"],
  ["unknown", "44444444-4444-4444-8444-444444444444", "pending"],
  ["spam", TOKEN, "spam"],
]) test(`${label} confirmation token cannot confirm a submission`, async () => {
  const app = edge("bookish-confirm", { rows: [{ id: "untouched", confirm_token: TOKEN, status }] });
  const before = structuredClone(app.rows);
  const response = await app.handler(confirmation(token));
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://meetbookish.com/confirmed/?status=invalid");
  assert.deepEqual(app.rows, before);
  assert.equal(app.emails.length, 0);
});

test('a confirmed claim stays outside the host desk until service review', async () => {
  const app = edge('bookish-confirm', {rows:[{id:'claim',confirm_token:TOKEN,status:'pending',kind:'claim',club_ref:'directory-ref'}]});
  const response=await app.handler(confirmation(TOKEN));
  assert.equal(app.rows[0].status,'confirmed');
  assert.equal(response.headers.get('location'),'https://meetbookish.com/confirmed/');
});
