import { authAdmin } from "../_shared/auth-admin.ts";
import { readBookishSecret } from "../_shared/secrets.ts";
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
    revokeApple: async (code, subject) =>
      revokeAppleGrant(code, subject, {
        clientId: await readBookishSecret("BOOKISH_APPLE_CLIENT_ID") ?? "",
        teamId: await readBookishSecret("BOOKISH_APPLE_TEAM_ID") ?? "",
        keyId: await readBookishSecret("BOOKISH_APPLE_KEY_ID") ?? "",
        privateKey: await readBookishSecret("BOOKISH_APPLE_PRIVATE_KEY") ?? "",
      }),
  })
);
