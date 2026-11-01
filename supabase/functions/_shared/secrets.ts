type ReaderOptions = {
  env: (name: string) => string | undefined;
  fetcher?: typeof fetch;
};

// Keep this list aligned with the service-role-only SQL RPC allowlist.
export const BOOKISH_SECRET_NAMES = [
  "BOOKISH_SITE_URL",
  "BOOKISH_EMAIL_FROM",
  "RESEND_API_KEY",
  "BOOKISH_APPLE_CLIENT_ID",
  "BOOKISH_APPLE_TEAM_ID",
  "BOOKISH_APPLE_KEY_ID",
  "BOOKISH_APPLE_PRIVATE_KEY",
  "BOOKISH_TERMS_URL",
  "BOOKISH_PRIVACY_URL",
  "BOOKISH_MODERATION_EMAIL",
  "BOOKISH_REPORT_WORKER_KEY",
] as const;

export function createSecretReader({ env, fetcher = fetch }: ReaderOptions) {
  return async (name: string): Promise<string | undefined> => {
    if (!(BOOKISH_SECRET_NAMES as readonly string[]).includes(name)) return;
    const configured = env(name);
    if (configured) return configured;
    // These two bootstrap credentials must always come from Supabase itself.
    const url = env("SUPABASE_URL");
    const key = env("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return;
    try {
      const response = await fetcher(
        `${url.replace(/\/$/, "")}/rest/v1/rpc/bookish_get_secret`,
        {
          method: "POST",
          headers: {
            apikey: key,
            authorization: `Bearer ${key}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ p_name: name }),
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!response.ok) return;
      const value: unknown = await response.json();
      return typeof value === "string" && value ? value : undefined;
    } catch {
      // Configuration failure must never log a decrypted value, key, or error body.
      return;
    }
  };
}

// Lazy reads permit rotation without an isolate restart and avoid startup I/O.
export const readBookishSecret = createSecretReader({ env: (name) => Deno.env.get(name) });
