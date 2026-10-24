// Execute the real handlers, replacing only their external transports.
// This context has no process, network transport, or production credentials.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { stripTypeScriptTypes } from "node:module";

export const TOKEN = "22222222-2222-4222-8222-222222222222";
export const FROM = "Bookish <hello@meetbookish.com>";

export function edge(name, options = {}) {
  const rows = structuredClone(options.rows ?? []);
  const emails = [];
  const env = {
    SUPABASE_URL: "https://database.example.test",
    SUPABASE_SERVICE_ROLE_KEY: "offline-database-placeholder",
    BOOKISH_EMAIL_FROM: FROM,
    RESEND_API_KEY: "offline-mail-placeholder",
    ...options.env,
  };
  const sb = {
    from(table) {
      assert.equal(table, "bookish_submissions");
      let operation = "select", values, count = false, single = false;
      const filters = [];
      const query = {
        select(_columns, config = {}) { count = config.count === "exact"; return query; },
        insert(value) { operation = "insert"; values = value; return query; },
        update(value) { operation = "update"; values = value; return query; },
        eq(key, value) { filters.push(row => row[key] === value); return query; },
        neq(key, value) { filters.push(row => row[key] !== value); return query; },
        gte(key, value) { filters.push(row => row[key] >= value); return query; },
        single() { single = true; return query; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            if (operation === "insert" && options.insertError) {
              return { data: null, error: { message: "offline insert failure" }, count: null };
            }
            let result;
            if (operation === "insert") {
              const row = { id: "submission-1", confirm_token: TOKEN, status: "pending",
                email_sent_at: null, confirmed_at: null, created_at: new Date().toISOString(), ...values };
              rows.push(row);
              result = [row];
            } else {
              result = rows.filter(row => filters.every(matches => matches(row)));
              if (operation === "update") for (const row of result) Object.assign(row, values);
            }
            return { data: count ? null : single ? result[0] : result,
              count: count ? result.length : null, error: null };
          }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  let handler;
  const context = vm.createContext({
    Request, Response, Headers, URL, crypto, TextEncoder, Uint8Array, Date,
    console: { log() {}, error() {} },
    createClient: () => sb,
    Deno: { env: { get: key => env[key] }, serve: fn => { handler = fn; } },
    fetch: async (url, init) => {
      assert.equal(url, "https://api.resend.com/emails", "unexpected external destination");
      assert.equal(init.method, "POST");
      assert.equal(init.headers.authorization, "Bearer offline-mail-placeholder");
      emails.push(JSON.parse(init.body));
      if (options.mailThrows) throw new TypeError("offline mail transport failure");
      return new Response("{}", { status: options.mailStatus ?? 200 });
    },
  });
  const file = new URL(`../../supabase/functions/${name}/index.ts`, import.meta.url);
  const source = fs.readFileSync(file, "utf8");
  const dependency = 'import { createClient } from "npm:@supabase/supabase-js@2";';
  assert.equal(source.split(dependency).length, 2, "expected one Supabase transport import");
  vm.runInContext(stripTypeScriptTypes(source.replace(dependency, "")), context, { filename: file.pathname });
  assert.equal(typeof handler, "function");
  return { handler, rows, emails };
}

export function submission(overrides = {}, origin = "https://meetbookish.com") {
  return new Request("https://database.example.test/functions/v1/bookish-submit", {
    method: "POST", headers: { "content-type": "application/json", origin, "x-forwarded-for": "192.0.2.1" },
    body: JSON.stringify({ kind: "claim", club_name: "Reading Together", club_id: "club-1",
      email: " Reader@Example.test ", first_name: "Ada", consent: true, elapsed_ms: 3000, ...overrides }),
  });
}

export const confirmation = token => new Request(
  `https://database.example.test/functions/v1/bookish-confirm${token === undefined ? "" : `?token=${encodeURIComponent(token)}`}`,
);
