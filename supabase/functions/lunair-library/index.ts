import {
  createStore,
  deliverEmail,
  json,
  readConfig,
  resendSender,
} from "../_shared/lunair/service.ts";
import { makeLibraryHandler } from "./handler.ts";

declare const EdgeRuntime: { waitUntil(work: Promise<unknown>): void };
Deno.serve(async (req) => {
  try {
    const config = readConfig((name) => Deno.env.get(name));
    const store = createStore(config);
    return await makeLibraryHandler({
      config,
      store,
      deliver: (id) => deliverEmail(id, config, store, resendSender(config)),
      background: (work) => EdgeRuntime.waitUntil(work),
    })(req);
  } catch {
    console.error("lunair_library_configuration_unavailable");
    return json({ error: "The test library is unavailable." }, 503);
  }
});
