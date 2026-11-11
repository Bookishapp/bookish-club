import { readFile } from 'node:fs/promises';

// Hosted roles and the pre-existing 010 throttle table. All short-code functions
// and policy decisions run from the real, unapplied 012 migration in PGlite.
export async function initShortAuthDb(db) {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public to anon,authenticated,service_role;
    alter default privileges in schema public grant all on tables to anon,authenticated;
    create schema bookish_private;
    create table bookish_private.auth_attempts(
      id uuid primary key default gen_random_uuid(),email_hash text not null,
      ip_hash text not null,action text not null,created_at timestamptz not null default now());`);
  await db.exec(await readFile(new URL('../../../supabase/sql/012_bookish_auth_codes.sql', import.meta.url), 'utf8'));
}
