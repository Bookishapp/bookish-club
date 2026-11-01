import { houseRulesResponse } from "../_shared/house-rules.ts";
Deno.serve((req) =>
  houseRulesResponse(req, {
    termsUrl: Deno.env.get("BOOKISH_TERMS_URL") ?? "",
    privacyUrl: Deno.env.get("BOOKISH_PRIVACY_URL") ?? "",
    contactEmail: Deno.env.get("BOOKISH_MODERATION_EMAIL") ?? "",
  })
);
