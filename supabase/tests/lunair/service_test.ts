import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.14";
import { readConfig } from "../../functions/_shared/lunair/service.ts";

const env: Record<string, string> = {
  SUPABASE_URL: "https://txpdaqqjuavxpjsjrztq.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "fixture",
  RESEND_API_KEY: "fixture",
  LUNAIR_EMAIL_FROM: "Lunair <noreply@fictora.co>",
  LUNAIR_TOKEN_PEPPER: "A".repeat(43),
};

Deno.test("site origin accepts HTTPS and exact HTTP loopback preview origins", () => {
  for (
    const origin of [
      "https://meetbookish.com",
      "http://localhost",
      "http://localhost:8768",
      "http://127.0.0.1",
      "http://127.0.0.1:8768",
    ]
  ) {
    const config = readConfig((name) =>
      name === "LUNAIR_SITE_ORIGIN" ? origin : env[name]
    );
    assertEquals(config.siteOrigin, origin);
    assertEquals(config.origins, [origin]);
  }
});

Deno.test("site origin rejects HTTP outside exact localhost and 127.0.0.1", () => {
  for (
    const origin of [
      "http://meetbookish.com",
      "http://localhost.evil.test:8768",
      "http://evil.localhost:8768",
      "http://127.0.0.1.evil.test:8768",
      "http://127.0.0.2:8768",
      "http://[::1]:8768",
      "http://127.1:8768",
      "http://2130706433:8768",
      "ftp://localhost:8768",
    ]
  ) {
    assertThrows(
      () =>
        readConfig((name) =>
          name === "LUNAIR_SITE_ORIGIN" ? origin : env[name]
        ),
      Error,
      "Invalid site origin",
    );
  }
});

Deno.test("site origin rejects credentials, paths, queries, fragments, and noncanonical origins", () => {
  for (
    const origin of [
      "https://user:password@meetbookish.com",
      "https://meetbookish.com/",
      "https://meetbookish.com/lunair/library",
      "https://meetbookish.com?query=value",
      "https://meetbookish.com#fragment",
      "https://meetbookish.com:443",
      "http://user:password@localhost:8768",
      "http://127.0.0.1:8768/",
      "http://127.0.0.1:8768/lunair/library",
      "http://localhost:8768?query=value",
      "http://localhost:8768#fragment",
      "http://localhost:80",
      "http://LOCALHOST:8768",
    ]
  ) {
    assertThrows(
      () =>
        readConfig((name) =>
          name === "LUNAIR_SITE_ORIGIN" ? origin : env[name]
        ),
      Error,
      "Invalid site origin",
    );
  }
});

Deno.test("loopback site origin still requires the isolated test Supabase project", () => {
  assertThrows(
    () =>
      readConfig((name) => {
        if (name === "LUNAIR_SITE_ORIGIN") return "http://127.0.0.1:8768";
        if (name === "SUPABASE_URL") {
          return "https://wqnrortftkffmbeugjky.supabase.co";
        }
        return env[name];
      }),
    Error,
    "Lunair requires the approved test project",
  );
});
