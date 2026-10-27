import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";
import { PGlite } from "npm:@electric-sql/pglite@0.3.14";

// PostgreSQL executes the real migration. This fixture has no network or remote database.
Deno.test({
  name:
    "database transactions enforce access, single-use links, rate limits, and email retry boundaries",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const db = new PGlite();
    try {
      await db.exec(
        `create role anon; create role authenticated; create role service_role bypassrls;
      create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
      grant usage on schema public,storage to service_role;
      grant all on all tables in schema storage to service_role;
      alter table storage.objects enable row level security;
      alter table storage.buckets enable row level security;
      grant usage on schema storage to anon,authenticated;
      grant select on storage.objects,storage.buckets to anon,authenticated;
      create policy existing_broad_objects on storage.objects for select to anon,authenticated using (true);
      create policy existing_broad_buckets on storage.buckets for select to anon,authenticated using (true);`,
      );
      await db.exec(
        await Deno.readTextFile(
          new URL(
            "../../migrations/20261027190044_lunair_shop_test.sql",
            import.meta.url,
          ),
        ),
      );
      const call = async (sql: string, params: unknown[] = []) =>
        (await db.query<{ value: unknown }>(sql, params)).rows[0]?.value;
      const record =
        `select public.lunair_record_purchase('buyer@example.com','vol1','cs_test_123','evt_123','price_vol1',900) as value`;
      const id = await call(record);
      assertEquals(
        await call(record),
        id,
        "duplicate events must preserve one outbox record",
      );
      assertEquals(
        await call(
          "select count(*)::int as value from public.lunair_purchases",
        ),
        1,
      );
      await assertRejects(() =>
        call(
          `select public.lunair_record_purchase('other@example.com','grimoire','cs_test_123','evt_other','price_grimoire',1900) as value`,
        )
      );
      await assertRejects(() =>
        call(
          `select public.lunair_record_purchase('buyer@example.com','grimoire','cs_live_x','evt_x','price_x',1900) as value`,
        )
      );
      const lease = "00000000-0000-4000-8000-000000000001";
      let claim = await call(
        "select public.lunair_claim_email($1,$2) as value",
        [id, lease],
      ) as Record<string, unknown>;
      assertEquals(claim.state, "claimed");
      assertEquals(
        (await call("select public.lunair_claim_email($1,$2) as value", [
          id,
          crypto.randomUUID(),
        ]) as Record<string, unknown>).state,
        "busy",
      );
      await call(
        "select public.lunair_prepare_email($1,$2,'subject','immutable payload') as value",
        [id, lease],
      );
      await call(
        "select public.lunair_prepare_email($1,$2,'different','changed payload') as value",
        [id, lease],
      );
      assertEquals(
        await call(
          "select body as value from public.lunair_email_outbox where id=$1",
          [id],
        ),
        "immutable payload",
      );
      await call("select public.lunair_release_email($1,$2) as value", [
        id,
        lease,
      ]);
      claim = await call("select public.lunair_claim_email($1,$2) as value", [
        id,
        lease,
      ]) as Record<string, unknown>;
      assertEquals(claim.body, "immutable payload");
      await call(
        "select public.lunair_finish_email($1,$2,'provider-1') as value",
        [id, lease],
      );
      assertEquals(
        (await call("select public.lunair_claim_email($1,$2) as value", [
          id,
          lease,
        ]) as Record<string, unknown>).state,
        "sent",
      );

      const magic = "1".repeat(64), access = "2".repeat(64);
      const queue =
        "select public.lunair_queue_magic($1,$2,'subject','link') as value";
      assertEquals(
        await call(queue, ["unknown@example.com", "3".repeat(64)]),
        null,
      );
      const magicId = await call(queue, ["buyer@example.com", magic]);
      assert(magicId);
      assertEquals(
        await call(
          "select public.lunair_pending_magic('buyer@example.com') as value",
        ),
        magicId,
      );
      assertEquals(
        await call(queue, ["buyer@example.com", "7".repeat(64)]),
        magicId,
        "concurrent or repeated enqueue must reuse the unexpired pending link",
      );
      await call("select public.lunair_claim_email($1,$2) as value", [
        magicId,
        lease,
      ]);
      await call("select public.lunair_release_email($1,$2) as value", [
        magicId,
        lease,
      ]);
      assertEquals(
        await call(
          "select public.lunair_pending_magic('buyer@example.com') as value",
        ),
        magicId,
      );
      await db.query(
        "update public.lunair_email_outbox set lease_until=now()-interval '1 minute',lease_id=$2 where id=$1",
        [magicId, lease],
      );
      assertEquals(
        (await call("select public.lunair_claim_email($1,$2) as value", [
          magicId,
          crypto.randomUUID(),
        ]) as Record<string, unknown>).state,
        "claimed",
        "expired worker leases are recoverable",
      );
      await db.query(
        "update public.lunair_email_outbox set lease_until=null,expires_at=now()+interval '1 minute' where id=$1",
        [magicId],
      );
      assertEquals(
        (await call("select public.lunair_claim_email($1,$2) as value", [
          magicId,
          lease,
        ]) as Record<string, unknown>).state,
        "expired",
        "nearly expired magic emails must not send a link that can expire in transport",
      );
      assertEquals(
        await call(
          "select public.lunair_pending_magic('buyer@example.com') as value",
        ),
        null,
      );
      const redeem = "select public.lunair_redeem_magic($1,$2) as value";
      const auth = await call(redeem, [magic, access]) as Record<
        string,
        unknown
      >;
      assertEquals(auth.email, "buyer@example.com");
      assertEquals(
        await call(redeem, [magic, "4".repeat(64)]),
        null,
        "magic links must be single-use",
      );
      assertEquals(
        (await call("select public.lunair_get_access($1) as value", [
          access,
        ]) as Record<string, unknown>).email,
        "buyer@example.com",
      );
      await db.exec(
        "update public.lunair_library_tokens set expires_at=now()-interval '1 second'",
      );
      assertEquals(
        await call("select public.lunair_get_access($1) as value", [access]),
        null,
      );
      await call(queue, ["buyer@example.com", "5".repeat(64)]);
      await db.exec(
        "update public.lunair_library_tokens set expires_at=now()-interval '1 second'",
      );
      assertEquals(await call(redeem, ["5".repeat(64), "6".repeat(64)]), null);

      for (let i = 0; i < 3; i++) {
        assertEquals(
          await call("select public.lunair_take_rate($1,3,3600) as value", [
            "ip:fixture",
          ]),
          true,
        );
      }
      assertEquals(
        await call("select public.lunair_take_rate($1,3,3600) as value", [
          "ip:fixture",
        ]),
        false,
      );
      await db.exec(
        "update public.lunair_rate_limits set reset_at=now()-interval '1 second'",
      );
      assertEquals(
        await call("select public.lunair_take_rate($1,3,3600) as value", [
          "ip:fixture",
        ]),
        true,
      );

      await db.exec(
        "insert into storage.objects(bucket_id,name) values ('lunair-packs-test','packs/spells-for-grown-ups-vol-1.zip'),('lunair-packs-test','packs/future-moon.zip'),('lunair-packs-test','draft.zip'),('other','packs/secret.zip')",
      );
      const packs = await call(
        "select public.lunair_owned_packs('buyer@example.com') as value",
      ) as { paths: string[]; grimoire: boolean };
      assertEquals(packs.paths, ["packs/spells-for-grown-ups-vol-1.zip"]);
      assertEquals(packs.grimoire, false);
      const grimoireDelivery = await call(
        `select public.lunair_record_purchase('buyer@example.com','grimoire','cs_test_456','evt_456','price_grimoire',1900) as value`,
      );
      const all = await call(
        "select public.lunair_owned_packs('buyer@example.com') as value",
      ) as { paths: string[]; grimoire: boolean };
      assertEquals(all.paths, [
        "packs/future-moon.zip",
        "packs/spells-for-grown-ups-vol-1.zip",
      ]);
      assertEquals(all.grimoire, true);
      await db.exec(
        "update public.lunair_email_outbox set first_attempt_at=now()-interval '24 hours', lease_until=null where status<>'sent'",
      );
      assertEquals(
        (await call("select public.lunair_claim_email($1,$2) as value", [
          grimoireDelivery,
          lease,
        ]) as Record<string, unknown>).state,
        "manual_review",
      );
      assertEquals(
        await call(
          "select public as value from storage.buckets where id='lunair-packs-test'",
        ),
        false,
      );
      await db.exec("set role anon");
      assertEquals(
        await call(
          "select count(*)::int as value from storage.objects where bucket_id='lunair-packs-test'",
        ),
        0,
        "existing permissive policies must not expose Lunair packs",
      );
      await assertRejects(() =>
        db.query("select * from public.lunair_purchases")
      );
      await assertRejects(() => call(record));
      await db.exec("reset role; set role service_role");
      assertEquals(
        await call(record),
        id,
        "service role can use RPCs without SECURITY DEFINER",
      );
    } finally {
      await db.close();
    }
  },
});
