# Lunair shop test deployment for Ted

Status, 2026-10-27: migration applied to `fictora-sav-test` only, and both new Lunair functions deployed as version 1. Required application secrets and the approved ZIP remain unprovisioned. Both endpoints return the expected fail-closed 503, the Stripe endpoint remains disabled, and the public library API URL remains empty. The production database write gate remains closed.

## Target and prerequisites

Use only Supabase `fictora-sav-test`, project `txpdaqqjuavxpjsjrztq`. Runtime configuration rejects any other project URL, including Fictora production `wqnrortftkffmbeugjky`.

Run these commands from the reviewed Bookish checkout containing this file. Do not deploy or edit Fictora's existing `stripe-webhook`, deploy all functions, or use `--prune`.

Stripe account: `acct_1RqH0IRXE02oMWVK`, test mode only. Both prices are one-time USD prices.

| Product | Amount | Product ID | Price ID |
| --- | --- | --- | --- |
| Spells for Grown-Ups, Vol. 1 | $9 | `prod_VWIDK9IKWlctwN` | `price_1UVFcuRXE02oMWVKCS1dOMwe` |
| The Grimoire | $19 | `prod_VWIEggzlhTLXbi` | `price_1UVFdjRXE02oMWVKAUMPuEkT` |

Required secret names in the test project:

- Built-in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- `LUNAIR_STRIPE_TEST_SECRET_KEY`: read in memory from Keychain service `ted-stripe-test`, account `acct_1RqH0IRXE02oMWVK`. Its prefix must be `sk_test_` or `rk_test_`. Never use `fictora-stripe-ro`, which is live. `STRIPE_SECRET_KEY` is accepted as a fallback only if it already contains a test key. Do not overwrite a shared production key.
- `LUNAIR_STRIPE_WEBHOOK_SECRET`: the separate Lunair endpoint's signing secret, expected in Keychain service `ted-stripe-test`, account `lunair-shop-webhook`. Always specify the account when reading this shared service name.
- `RESEND_API_KEY`: reuse the existing provider credential through its authorized secret store. The test project lacked this secret at inspection. The Supabase Management API returns only digests, so it cannot recover this value. No new account or copied credential file is needed or authorized.
- `LUNAIR_EMAIL_FROM`: `Lunair <noreply@fictora.co>`, only after confirming the existing Resend credential permits the verified fictora.co domain. Prior source evidence supports fictora.co; meetbookish.com sending verification remains unproven.
- `LUNAIR_TOKEN_PEPPER`: a fresh high-entropy secret of at least 32 characters, stored only in Keychain and function secrets. Keep it stable across deployments. Rotation invalidates outstanding magic and access tokens.
- `LUNAIR_SITE_ORIGIN`: `https://meetbookish.com`.
- `LUNAIR_VOL1_PRODUCT_ID`, `LUNAIR_VOL1_PRICE_ID`, `LUNAIR_GRIMOIRE_PRODUCT_ID`, and `LUNAIR_GRIMOIRE_PRICE_ID`: the public identifiers above.
- Optional `LUNAIR_EXTRA_ORIGINS`: comma-separated exact reviewed preview origins. Only HTTPS origins, localhost, and 127.0.0.1 HTTP development origins are accepted. Never use a wildcard.

Provision secrets directly from the existing secure store into Supabase. Do not put secret values in command arguments, output, screenshots, temporary files, source, or Git. The CLI accepts `--env-file /dev/stdin`, which can receive an in-memory stream from an approved secret-store reader. Do not run that reader without a consumer, or enable shell tracing. Missing email, service, or pepper configuration fails closed with 503; missing Stripe or catalog configuration also blocks the webhook. The library does not require Stripe credentials.

## Exact SQL application

The exact reviewed SQL is `supabase/migrations/20261027190044_lunair_shop_test.sql`, reproduced below. It creates only Lunair tables, functions, the private test bucket, and restrictive policies that isolate that bucket from existing broad Storage policies. Every new table has RLS and no anon or authenticated grants. All RPCs are security invoker, with execution granted only to service_role.

The migration has already been applied to this test project through `apply_migration`. Do not rerun this non-idempotent SQL against it. The exact commands below document the reviewed application procedure for an authorized clean test target; this runtime currently accepts only the named project. These CLI commands were checked against the installed CLI help. Do not use `db push`, which could involve unrelated migration history.

```sh
cd /path/to/reviewed/bookish-club
supabase link --project-ref txpdaqqjuavxpjsjrztq
python3 -c 'from pathlib import Path; assert Path("supabase/.temp/project-ref").read_text().strip() == "txpdaqqjuavxpjsjrztq"'
supabase db query --linked --file supabase/migrations/20261027190044_lunair_shop_test.sql
```

If CLI linking requires unavailable credentials, use the connected Supabase `apply_migration` tool with `project_id=txpdaqqjuavxpjsjrztq`, `name=lunair_shop_test`, and `query` set to the exact file contents. Use `apply_migration` for this DDL, not `execute_sql`. No production target is permitted.

Read-only acceptance SQL after application:

```sql
select id, public from storage.buckets where id='lunair-packs-test';
select tablename, rowsecurity from pg_tables
where schemaname='public' and tablename in ('lunair_purchases','lunair_email_outbox','lunair_library_tokens','lunair_rate_limits');
select proname, prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('lunair_record_purchase','lunair_claim_email','lunair_prepare_email','lunair_finish_email','lunair_release_email','lunair_pending_magic','lunair_queue_magic','lunair_redeem_magic','lunair_get_access','lunair_take_rate','lunair_owned_packs');
select grantee, routine_name, privilege_type from information_schema.routine_privileges
where routine_schema='public' and routine_name in ('lunair_record_purchase','lunair_claim_email','lunair_prepare_email','lunair_finish_email','lunair_release_email','lunair_pending_magic','lunair_queue_magic','lunair_redeem_magic','lunair_get_access','lunair_take_rate','lunair_owned_packs');
select policyname, permissive, roles, cmd from pg_policies
where schemaname='storage' and policyname in ('lunair_private_objects','lunair_private_bucket');
```

Verified in the test project: private bucket, RLS on all four new tables, security-invoker RPCs with service_role execution and no anon/authenticated execution, and two restrictive Storage policies. Existing cloned-schema advisor errors and warnings were unchanged. The only new advisor entries were four expected RLS-enabled/no-policy informational findings for these service-only tables. This does not certify unrelated cloned-schema functions. The filtered queries intentionally exclude existing unrelated Lunair objects.

## Upload and deploy

Wait for the artwork worker's final approved ZIP. A staging or partially reviewed ZIP must not be uploaded. Keep the paid ZIP out of the public repository. Set `LUNAIR_APPROVED_ZIP` to its final local path, then use the linked and verified test project:

```sh
python3 -c 'from pathlib import Path; assert Path("supabase/.temp/project-ref").read_text().strip() == "txpdaqqjuavxpjsjrztq"'
supabase storage cp "$LUNAIR_APPROVED_ZIP" ss:///lunair-packs-test/packs/spells-for-grown-ups-vol-1.zip --linked --content-type application/zip --experimental
supabase functions deploy lunair-shop-webhook --project-ref txpdaqqjuavxpjsjrztq --no-verify-jwt --use-api
supabase functions deploy lunair-library --project-ref txpdaqqjuavxpjsjrztq --no-verify-jwt --use-api
```

Stripe test endpoint URL: `https://txpdaqqjuavxpjsjrztq.supabase.co/functions/v1/lunair-shop-webhook`. The existing separate test endpoint is `we_1UVFiERXE02oMWVKDlbBVxBr`, currently DISABLED, and subscribed only to `checkout.session.completed`. Both Payment Links are card-only. Keep the endpoint disabled until the reviewed backend is ready. The code also supports `checkout.session.async_payment_succeeded`, but that optional event is not currently subscribed and is unnecessary for these card-only links. Use the distinct endpoint secret, never Fictora's existing webhook secret. Keep automatic tax, discounts, shipping charges, adjustable quantities, subscriptions, and extra line items disabled for these two test links, because all are rejected by design.

Public library API URL: `https://txpdaqqjuavxpjsjrztq.supabase.co/functions/v1/lunair-library`. No frontend API key is needed. Set the public library configuration only after the functions and schema are available. This rollout does not merge or publish the Bookish PR. Authenticated unrelated Fictora test sessions are acknowledged with an ignored result after complete line-item inspection; any Lunair product or price match still receives strict validation.

## Verification and recovery

Run local checks from `supabase/`:

```sh
deno task test:lunair
deno task check:lunair
deno lint functions/_shared/lunair functions/lunair-shop-webhook functions/lunair-library tests/lunair
deno fmt --check functions/_shared/lunair functions/lunair-shop-webhook functions/lunair-library tests/lunair deno.json
```

Then perform the separately scoped test checkout with an owner-controlled mailbox, confirm the provider delivery event and inbox, download the ZIP, request a library magic link, redeem it once, and verify that reusing it fails. A Vol. 1 buyer sees only Vol. 1. A Grimoire buyer sees every valid `packs/<lowercase-hyphenated-slug>.zip` object in the dedicated private bucket, including future uploads. Upload only approved buyer-facing packs into that path. Other object paths remain invisible to the library.

Replay the same Stripe test event and confirm one purchase row, one outbox row, and no duplicate email. Check only safe metadata when recording evidence:

```sql
select product, count(*) from public.lunair_purchases group by product;
select kind, status, count(*) from public.lunair_email_outbox group by kind,status;
select id, kind, status, attempts, first_attempt_at, sent_at, provider_id
from public.lunair_email_outbox order by created_at desc limit 10;
```

Email bodies contain bearer links and must never be pasted into reports or screenshots. Purchase email download links expire after 24 hours. Library download links expire after 15 minutes. Magic links are single-use and expire after 15 minutes; library access tokens expire after one hour. Redemption returns only `{accessToken,expiresAt}`. The frontend saves the bearer immediately, then requests packs through `list`. A Storage or pack-read failure therefore does not consume the emailed link without preserving a usable library session. Tokens use 32 random bytes, with purpose-separated HMAC hashes stored for verification. Email payloads are necessarily retained in the service-only outbox for deterministic retries.

Purchase delivery uses a durable outbox, five-minute leases, immutable email bodies, and a stable Resend idempotency key. Stripe retries a 503 while delivery is pending. At 23 hours after the first attempt, automatic delivery stops with `manual_review` to avoid duplicate sends after Resend's 24-hour idempotency retention. Ted must inspect provider events using the outbox's stable key and provider ID. Mark a row sent only after proving provider acceptance, or arrange a newly reviewed replacement email only after proving the original was not accepted. Never clear first_attempt_at or delete the dedupe record to force a retry. Magic-link delivery runs through EdgeRuntime.waitUntil after durable enqueue, so response status does not expose ownership. Transient transport, 408, 429, and 5xx failures retry up to three times in the same background task, after one-second and three-second delays, with the exact same payload and idempotency key. Permanent provider errors stop immediately and move the job to manual review. A later request for the same email resumes the existing unexpired pending job before consuming a new email allowance or issuing another token, providing recovery if an Edge invocation stops. Concurrent enqueues are serialized per email. The database rejects delivery of consumed links and links with less than two minutes left, and caps each magic job at nine claims. A missing or expired pending link follows the normal rate-limited new-link path. The outbox records unfinished work even if the runtime is interrupted; delivery cannot be guaranteed without a succeeding invocation. There is no new background schedule or durable worker.

The per-email limit is 3 requests per hour, the per-IP API limit is 60 per hour, and the global limits are 200 email requests and 3,000 API requests per hour. Email-specific limits return the same 202 response as unknown addresses. IP headers are only a throttle signal; global and per-email limits remain authoritative. This is a small test-shop policy, not a claim of full production abuse protection.

Rollback: disable only the separate Lunair Stripe test endpoint, remove the public library API configuration, and remove or redeploy only the two Lunair functions. Preserve purchases and outbox records for reconciliation. Do not drop tables or alter the existing Fictora webhook as a rollback. Signed download links remain valid until their expiration. Review a separate destructive cleanup only after reconciliation.

## Complete migration SQL

```sql
-- Lunair TEST ONLY. Review and apply only to txpdaqqjuavxpjsjrztq.
-- Does not alter Fictora profiles, subscriptions, or existing webhook tables.
begin;

create table public.lunair_purchases (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email) and length(email) <= 254),
  product text not null check (product in ('vol1','grimoire')),
  stripe_session_id text not null unique check (stripe_session_id like 'cs_test_%'),
  stripe_event_id text not null,
  stripe_price_id text not null,
  amount integer not null,
  currency text not null default 'usd' check (currency = 'usd'),
  livemode boolean not null default false check (not livemode),
  created_at timestamptz not null default now(),
  check ((product='vol1' and amount=900) or (product='grimoire' and amount=1900))
);
create index lunair_purchases_email_idx on public.lunair_purchases(email);
create table public.lunair_email_outbox (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  email text not null,
  kind text not null check (kind in ('purchase','magic')),
  product text check (product in ('vol1','grimoire')),
  subject text,
  body text,
  status text not null default 'pending' check (status in ('pending','sent','manual_review','expired')),
  expires_at timestamptz,
  lease_id uuid,
  lease_until timestamptz,
  first_attempt_at timestamptz,
  attempts integer not null default 0,
  provider_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.lunair_library_tokens (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  email text not null,
  purpose text not null check (purpose in ('magic','access')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index lunair_library_tokens_expiry_idx on public.lunair_library_tokens(expires_at);
create table public.lunair_rate_limits (
  key text primary key,
  requests integer not null,
  reset_at timestamptz not null
);

alter table public.lunair_purchases enable row level security;
alter table public.lunair_email_outbox enable row level security;
alter table public.lunair_library_tokens enable row level security;
alter table public.lunair_rate_limits enable row level security;
revoke all on public.lunair_purchases,public.lunair_email_outbox,public.lunair_library_tokens,public.lunair_rate_limits from public,anon,authenticated;
grant all on public.lunair_purchases,public.lunair_email_outbox,public.lunair_library_tokens,public.lunair_rate_limits to service_role;

-- No public Storage policies. Only the server service role can sign or upload.
insert into storage.buckets(id,name,public,allowed_mime_types)
values ('lunair-packs-test','lunair-packs-test',false,array['application/zip','application/x-zip-compressed']);

-- Shared projects can contain permissive policies. Restrictive guards prevent
-- those existing policies from granting access to this dedicated private bucket.
create policy lunair_private_objects on storage.objects as restrictive for all to anon,authenticated
using (bucket_id <> 'lunair-packs-test') with check (bucket_id <> 'lunair-packs-test');
create policy lunair_private_bucket on storage.buckets as restrictive for all to anon,authenticated
using (id <> 'lunair-packs-test') with check (id <> 'lunair-packs-test');

create function public.lunair_record_purchase(p_email text,p_product text,p_session text,p_event text,p_price text,p_amount integer)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_purchase public.lunair_purchases; v_id uuid;
begin
  insert into public.lunair_purchases(email,product,stripe_session_id,stripe_event_id,stripe_price_id,amount)
  values (p_email,p_product,p_session,p_event,p_price,p_amount)
  on conflict (stripe_session_id) do nothing;
  select * into strict v_purchase from public.lunair_purchases where stripe_session_id=p_session;
  if v_purchase.email<>p_email or v_purchase.product<>p_product or v_purchase.stripe_price_id<>p_price or v_purchase.amount<>p_amount then
    raise exception 'Purchase conflict';
  end if;
  insert into public.lunair_email_outbox(dedupe_key,email,kind,product)
  values ('purchase:'||p_session,p_email,'purchase',p_product)
  on conflict (dedupe_key) do nothing;
  select id into strict v_id from public.lunair_email_outbox where dedupe_key='purchase:'||p_session;
  return v_id;
end $$;

-- Stable payload + stable provider idempotency key survive retries and crashes.
-- Resend keeps idempotency keys for 24h. At 23h stop automatic retries and reconcile.
create function public.lunair_claim_email(p_id uuid,p_lease uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v public.lunair_email_outbox;
begin
  select * into v from public.lunair_email_outbox where id=p_id for update;
  if not found then raise exception 'Missing delivery'; end if;
  if v.status='sent' then return jsonb_build_object('state','sent'); end if;
  if v.status='expired' or (v.kind='magic' and (v.expires_at<=now()+interval '2 minutes' or not exists(
    select 1 from public.lunair_library_tokens where 'magic:'||token_hash=v.dedupe_key
    and consumed_at is null and expires_at>now()+interval '2 minutes'))) then
    update public.lunair_email_outbox set status='expired',lease_id=null,lease_until=null where id=p_id;
    return jsonb_build_object('state','expired');
  end if;
  if v.status='manual_review' or v.first_attempt_at < now()-interval '23 hours' or (v.kind='magic' and v.attempts>=9) then
    update public.lunair_email_outbox set status='manual_review' where id=p_id;
    return jsonb_build_object('state','manual_review');
  end if;
  if v.lease_until>now() then return jsonb_build_object('state','busy'); end if;
  update public.lunair_email_outbox set lease_id=p_lease,lease_until=now()+interval '5 minutes',
    first_attempt_at=coalesce(first_attempt_at,now()),attempts=attempts+1 where id=p_id;
  return jsonb_build_object('state','claimed','email',v.email,'kind',v.kind,'product',v.product,'subject',v.subject,'body',v.body);
end $$;
create function public.lunair_prepare_email(p_id uuid,p_lease uuid,p_subject text,p_body text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v public.lunair_email_outbox;
begin
  update public.lunair_email_outbox set subject=coalesce(subject,p_subject),body=coalesce(body,p_body)
  where id=p_id and lease_id=p_lease and lease_until>now() and status='pending' returning * into v;
  if not found then raise exception 'Delivery lease lost'; end if;
  return jsonb_build_object('subject',v.subject,'body',v.body);
end $$;
create function public.lunair_finish_email(p_id uuid,p_lease uuid,p_provider_id text)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.lunair_email_outbox set status='sent',sent_at=now(),provider_id=p_provider_id,lease_id=null,lease_until=null
  where id=p_id and lease_id=p_lease and status='pending';
  if not found then raise exception 'Delivery lease lost'; end if;
  return true;
end $$;
create function public.lunair_release_email(p_id uuid,p_lease uuid,p_terminal boolean default false)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.lunair_email_outbox set lease_id=null,lease_until=null,
    status=case when p_terminal then 'manual_review' else status end
  where id=p_id and lease_id=p_lease and status='pending';
  return found;
end $$;

create function public.lunair_pending_magic(p_email text)
returns uuid language sql security invoker set search_path = '' as $$
  select e.id from public.lunair_email_outbox e join public.lunair_library_tokens t on e.dedupe_key='magic:'||t.token_hash
  where e.email=p_email and e.kind='magic' and e.status='pending'
    and e.expires_at>now()+interval '2 minutes' and t.expires_at>now()+interval '2 minutes' and t.consumed_at is null
  order by e.created_at desc limit 1;
$$;
create function public.lunair_queue_magic(p_email text,p_hash text,p_subject text,p_body text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid;
begin
  if not exists(select 1 from public.lunair_purchases where email=p_email) then return null; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_email,0));
  v_id:=public.lunair_pending_magic(p_email);
  if v_id is not null then return v_id; end if;
  insert into public.lunair_library_tokens(token_hash,email,purpose,expires_at)
  values(p_hash,p_email,'magic',now()+interval '15 minutes');
  insert into public.lunair_email_outbox(dedupe_key,email,kind,subject,body,expires_at)
  values('magic:'||p_hash,p_email,'magic',p_subject,p_body,now()+interval '15 minutes') returning id into v_id;
  return v_id;
end $$;
create function public.lunair_redeem_magic(p_hash text,p_access_hash text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v public.lunair_library_tokens; v_expiry timestamptz:=now()+interval '1 hour';
begin
  update public.lunair_library_tokens set consumed_at=now()
  where token_hash=p_hash and purpose='magic' and consumed_at is null and expires_at>now()
  returning * into v;
  if not found then return null; end if;
  insert into public.lunair_library_tokens(token_hash,email,purpose,expires_at)
  values(p_access_hash,v.email,'access',v_expiry);
  return jsonb_build_object('email',v.email,'expiresAt',v_expiry);
end $$;
create function public.lunair_get_access(p_hash text)
returns jsonb language sql security invoker set search_path = '' as $$
  select jsonb_build_object('email',email,'expiresAt',expires_at) from public.lunair_library_tokens
  where token_hash=p_hash and purpose='access' and expires_at>now() and consumed_at is null;
$$;
create function public.lunair_take_rate(p_key text,p_limit integer,p_seconds integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_count integer;
begin
  if p_limit<1 or p_seconds<1 or p_seconds>86400 then raise exception 'Invalid rate window'; end if;
  insert into public.lunair_rate_limits(key,requests,reset_at) values(p_key,1,now()+make_interval(secs=>p_seconds))
  on conflict (key) do update set
    requests=case when public.lunair_rate_limits.reset_at<=now() then 1 else public.lunair_rate_limits.requests+1 end,
    reset_at=case when public.lunair_rate_limits.reset_at<=now() then now()+make_interval(secs=>p_seconds) else public.lunair_rate_limits.reset_at end
  returning requests into v_count;
  return v_count<=p_limit;
end $$;
create function public.lunair_owned_packs(p_email text)
returns jsonb language sql security invoker set search_path = '' as $$
  with owned as (select product from public.lunair_purchases where email=p_email),
  packs as (select distinct name from storage.objects
    where bucket_id='lunair-packs-test' and name ~ '^packs/[a-z0-9]+(-[a-z0-9]+)*\.zip$'
    and (exists(select 1 from owned where product='grimoire') or
      (name='packs/spells-for-grown-ups-vol-1.zip' and exists(select 1 from owned where product='vol1'))))
  select jsonb_build_object('paths',coalesce((select jsonb_agg(name order by name) from packs),'[]'::jsonb),
    'grimoire',exists(select 1 from owned where product='grimoire'));
$$;

-- Explicit allowlist so subsequent unrelated functions are untouched.
do $$
declare fn regprocedure;
begin
  for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('lunair_record_purchase','lunair_claim_email','lunair_prepare_email',
      'lunair_finish_email','lunair_release_email','lunair_pending_magic','lunair_queue_magic','lunair_redeem_magic','lunair_get_access',
      'lunair_take_rate','lunair_owned_packs') loop
    execute format('revoke all on function %s from public, anon, authenticated',fn);
    execute format('grant execute on function %s to service_role',fn);
  end loop;
end $$;
commit;

```
