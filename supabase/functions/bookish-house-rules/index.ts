import { houseRulesResponse } from "../_shared/house-rules.ts";
import { readBookishSecret } from "../_shared/secrets.ts";
Deno.serve(async (req) =>
  houseRulesResponse(req, {
    termsUrl: await readBookishSecret("BOOKISH_TERMS_URL") ?? "",
    privacyUrl: await readBookishSecret("BOOKISH_PRIVACY_URL") ?? "",
    contactEmail: await readBookishSecret("BOOKISH_MODERATION_EMAIL") ?? "",
  })
);
