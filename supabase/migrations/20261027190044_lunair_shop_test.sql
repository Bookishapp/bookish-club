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
