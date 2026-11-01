import { authAdmin } from "../_shared/auth-admin.ts";
import {
  handleAccountDeletion,
  revokeAppleGrant,
} from "../_shared/account-deletion.ts";

const admin = authAdmin(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
Deno.serve((req) =>
  handleAccountDeletion(req, {
    ...admin,
    revokeApple: (code, subject) =>
      revokeAppleGrant(code, subject, {
        clientId: Deno.env.get("BOOKISH_APPLE_CLIENT_ID") ?? "",
        teamId: Deno.env.get("BOOKISH_APPLE_TEAM_ID") ?? "",
        keyId: Deno.env.get("BOOKISH_APPLE_KEY_ID") ?? "",
        privateKey: Deno.env.get("BOOKISH_APPLE_PRIVATE_KEY") ?? "",
      }),
  })
);
