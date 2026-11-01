import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSecretReader } from '../../supabase/functions/_shared/secrets.ts';

const platform = {
  SUPABASE_URL: 'https://dedicated.supabase.co/',
  SUPABASE_SERVICE_ROLE_KEY: 'server-only-key',
};
const reader = (env, fetcher) => createSecretReader({ env: name => env[name], fetcher });

test('configured environment wins without contacting Vault', async () => {
  const read = reader({ RESEND_API_KEY: 'env-value' }, () => { throw Error('must not contact Vault'); });
  assert.equal(await read('RESEND_API_KEY'), 'env-value');
});

test('missing environment falls back to the scoped RPC using the injected service role', async () => {
  const read = reader(platform, async (url, options) => {
    assert.equal(url, 'https://dedicated.supabase.co/rest/v1/rpc/bookish_get_secret');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.apikey, 'server-only-key');
    assert.equal(options.headers.authorization, 'Bearer server-only-key');
    assert.deepEqual(JSON.parse(options.body), { p_name: 'RESEND_API_KEY' });
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json('vault-value');
  });
  assert.equal(await read('RESEND_API_KEY'), 'vault-value');
});

test('empty environment falls back and Vault updates are read on the next call', async () => {
  let value = 'first';
  const read = reader({ ...platform, BOOKISH_EMAIL_FROM: '' }, async () => Response.json(value));
  assert.equal(await read('BOOKISH_EMAIL_FROM'), 'first');
  value = 'rotated';
  assert.equal(await read('BOOKISH_EMAIL_FROM'), 'rotated');
});

test('missing platform credentials and non-Bookish names never attempt a Vault request', async () => {
  const never = () => { assert.fail('must not contact Vault'); };
  for (const env of [{}, { SUPABASE_URL: platform.SUPABASE_URL }, { SUPABASE_SERVICE_ROLE_KEY: platform.SUPABASE_SERVICE_ROLE_KEY }]) {
    assert.equal(await reader(env, never)('RESEND_API_KEY'), undefined);
  }
  for (const name of ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY', 'UNRELATED_SECRET']) {
    assert.equal(await reader({ ...platform, UNRELATED_SECRET: 'private' }, never)(name), undefined);
  }
});

test('absent, denied, malformed, and unavailable Vault reads fail closed without exposing details', async t => {
  const logs = [];
  for (const method of ['log', 'warn', 'error']) t.mock.method(console, method, (...args) => logs.push(args));
  const transports = [
    async () => Response.json(null),
    async () => Response.json(''),
    async () => Response.json({ decrypted_secret: 'must-not-escape' }),
    async () => new Response('private database details and server-only-key', { status: 403 }),
    async () => new Response('invalid JSON'),
    async () => { throw Error('private network details and server-only-key'); },
  ];
  for (const fetcher of transports) {
    assert.equal(await reader(platform, fetcher)('RESEND_API_KEY'), undefined);
  }
  assert.deepEqual(logs, []);
});

test('Vault preserves multiline Apple keys verbatim', async () => {
  const pem = '-----BEGIN PRIVATE KEY-----\nfixture-key\n-----END PRIVATE KEY-----\n';
  const read = reader(platform, async () => Response.json(pem));
  assert.equal(await read('BOOKISH_APPLE_PRIVATE_KEY'), pem);
});

test('report worker key uses the same lazy environment and scoped Vault reader', async()=>{
 const envRead=reader({BOOKISH_REPORT_WORKER_KEY:'worker-env'},()=>assert.fail('No Vault call for an environment key'));
 assert.equal(await envRead('BOOKISH_REPORT_WORKER_KEY'),'worker-env');
 const vaultRead=reader(platform,async(_url,options)=>{
  assert.deepEqual(JSON.parse(options.body),{p_name:'BOOKISH_REPORT_WORKER_KEY'});
  return Response.json('worker-vault');
 });
 assert.equal(await vaultRead('BOOKISH_REPORT_WORKER_KEY'),'worker-vault');
});
