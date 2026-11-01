import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {bookishAuthHandler} from '../../supabase/functions/_shared/bookish-auth.ts';
import {authAdmin} from '../../supabase/functions/_shared/auth-admin.ts';
import {createSecretReader} from '../../supabase/functions/_shared/secrets.ts';
const req=b=>new Request('https://local.test/auth',{method:'POST',headers:{origin:'capacitor://localhost','content-type':'application/json'},body:JSON.stringify(b)});
function fixture(overrides={}){const calls=[];return {calls,deps:{publicKey:'public-anon',configured:async()=>true,throttle:async()=>true,lookup:async()=>null,create:async e=>calls.push(['create',e]),generate:async e=>{calls.push(['generate',e]);return '123456';},send:async(e,t)=>{calls.push(['send',e,t]);return true;},verify:async()=>({access_token:'access',refresh_token:'refresh',expires_in:3600,user:{id:'bookish',app_metadata:{app:'bookish'}}}),refresh:async()=>({access_token:'access',refresh_token:'refresh',expires_in:3600,user:{id:'bookish',app_metadata:{app:'bookish'}}}),getUser:async()=>({id:'bookish',app_metadata:{app:'bookish'}}),logout:async()=>{},sync:async()=>{},...overrides}};}
test('trusted signup provisions only absent identities and sends code without exposing secrets',async()=>{const {deps,calls}=fixture();const r=await bookishAuthHandler(req({action:'start',email:'Reader@Example.test'}),deps);assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true});assert.deepEqual(calls,[['create','reader@example.test'],['generate','reader@example.test'],['send','reader@example.test','123456']]);assert.equal(r.headers.get('access-control-allow-origin'),'capacitor://localhost');});
test('existing foreign identity is never promoted, mailed, or changed and has same public response',async()=>{const {deps,calls}=fixture({lookup:async()=>({id:'fictora',bookish:false})});const r=await bookishAuthHandler(req({action:'start',email:'reader@example.test'}),deps);assert.deepEqual(await r.json(),{ok:true});assert.deepEqual(calls,[]);});
test('verified email session includes safe public key, syncs ownership, and rejects foreign identities', async () => {
  let synced = false;
  const { deps } = fixture({
    lookup: async () => ({ id: 'bookish', bookish: true }),
    sync: async () => { synced = true; },
  });
  const response = await bookishAuthHandler(req({ action: 'verify', email: 'reader@example.test', token: '123456' }), deps);
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.public_key, 'public-anon');
  assert.equal(result.session.access_token, 'access');
  assert.equal(synced, true);

  let foreignVerified = false;
  const foreign = fixture({
    lookup: async () => ({ id: 'bookish', bookish: true }),
    verify: async () => {
      foreignVerified = true;
      return {
        user: { id: 'foreign', app_metadata: {} },
        access_token: 'secret',
        refresh_token: 'private-refresh',
      };
    },
  });
  const denied = await bookishAuthHandler(req({ action: 'verify', email: 'reader@example.test', token: '123456' }), foreign.deps);
  assert.equal(foreignVerified, true);
  assert.equal(denied.status, 401);
  const deniedBody = await denied.text();
  assert.ok(!deniedBody.includes('secret'));
  assert.ok(!deniedBody.includes('private-refresh'));
});
test('rate bounds and missing email configuration fail closed before provisioning',async()=>{for(const override of [{throttle:async()=>false},{configured:async()=>false},{publicKey:''}]){const {deps,calls}=fixture(override);const r=await bookishAuthHandler(req({action:'start',email:'reader@example.test'}),deps);assert.ok([429,503].includes(r.status));assert.deepEqual(calls,[]);}});
test('refresh validates trusted identity, and logout verifies bearer before revoking',async()=>{const {deps}=fixture();assert.equal((await bookishAuthHandler(req({action:'refresh',refresh_token:'refresh'}),deps)).status,200);assert.equal((await bookishAuthHandler(req({action:'logout'}),deps)).status,401);const r=req({action:'logout'});r.headers.set('authorization','Bearer valid');assert.equal((await bookishAuthHandler(r,deps)).status,200);});
test('oversized input, invalid origin, unknown action, and malformed codes are rejected',async()=>{const {deps}=fixture();assert.equal((await bookishAuthHandler(req({action:'verify',email:'a@b.test',token:'bad'}),deps)).status,400);const r=req({action:'start',email:'a@b.test'});r.headers.set('origin','https://attacker.test');assert.equal((await bookishAuthHandler(r,deps)).status,403);assert.equal((await bookishAuthHandler(req({action:'unknown'}),deps)).status,400);assert.equal((await bookishAuthHandler(req({action:'start',email:'x'.repeat(9000)}),deps)).status,413);});
test('reviewer password authenticates an existing trusted account and rejects foreign email before password exchange',async()=>{let exchanged=false;const {deps}=fixture({lookup:async()=>({id:'bookish',bookish:true}),password:async()=>{exchanged=true;return {access_token:'access',refresh_token:'refresh',user:{id:'bookish',app_metadata:{app:'bookish'}}};}});const r=await bookishAuthHandler(req({action:'password',email:'reviewer@example.test',password:'secure-reviewer-password'}),deps);assert.equal(r.status,200);assert.equal(exchanged,true);exchanged=false;deps.lookup=async()=>({id:'foreign',bookish:false});assert.equal((await bookishAuthHandler(req({action:'password',email:'foreign@example.test',password:'secure-reviewer-password'}),deps)).status,401);assert.equal(exchanged,false);});

for (const body of [
  { action: 'password', email: 'reviewer@example.test', password: 'fixture-password' },
  { action: 'verify', email: 'reviewer@example.test', token: '123456' },
  { action: 'refresh', refresh_token: 'fixture-refresh' },
]) {
  test(`${body.action} returns a trusted session without email delivery configuration`, async () => {
    let synced;
    const { deps, calls } = fixture({
      configured: async () => false,
      lookup: async () => ({ id: 'bookish', bookish: true }),
      password: async () => ({
        access_token: 'access',
        refresh_token: 'refresh',
        user: { id: 'bookish', app_metadata: { app: 'bookish' } },
      }),
      sync: async token => { synced = token; },
    });
    const response = await bookishAuthHandler(req(body), deps);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.ok, true);
    assert.equal(result.public_key, 'public-anon');
    assert.equal(result.session.user.id, 'bookish');
    assert.equal(synced, 'access');
    assert.deepEqual(calls, []);
  });
}

test('logout revokes a trusted session without email delivery configuration', async () => {
  let revoked;
  const { deps, calls } = fixture({
    configured: async () => false,
    logout: async token => { revoked = token; },
  });
  const request = req({ action: 'logout' });
  request.headers.set('authorization', 'Bearer fixture-access');
  const response = await bookishAuthHandler(request, deps);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(revoked, 'fixture-access');
  assert.deepEqual(calls, []);
});

test('every auth action still fails closed without the public key', async () => {
  for (const body of [
    { action: 'start', email: 'reviewer@example.test' },
    { action: 'verify', email: 'reviewer@example.test', token: '123456' },
    { action: 'password', email: 'reviewer@example.test', password: 'fixture-password' },
    { action: 'refresh', refresh_token: 'fixture-refresh' },
    { action: 'logout' },
  ]) {
    const { deps, calls } = fixture({ publicKey: '' });
    const response = await bookishAuthHandler(req(body), deps);
    assert.equal(response.status, 503, body.action);
    assert.deepEqual(calls, []);
  }
});

async function deployedAuth() {
  let handler;
  const secretReads = [];
  const authRequests = [];
  const rpcRequests = [];
  const env = {
    SUPABASE_URL: 'https://local.test',
    SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-role',
    SUPABASE_ANON_KEY: 'public-anon',
  };
  const fetcher = async (url, options) => {
    const path = new URL(url).pathname;
    if (path === '/rest/v1/rpc/bookish_get_secret') {
      secretReads.push(JSON.parse(options.body).p_name);
      return Response.json(null);
    }
    if (path === '/rest/v1/rpc/bookish_sync_account') return Response.json({});
    authRequests.push(path);
    if (path === '/auth/v1/user') {
      return Response.json({ id: 'bookish', app_metadata: { app: 'bookish' } });
    }
    if (path === '/auth/v1/logout') return new Response(null, { status: 204 });
    if (path === '/auth/v1/token' || path === '/auth/v1/verify') {
      return Response.json({
        access_token: 'access',
        refresh_token: 'refresh',
        user: { id: 'bookish', app_metadata: { app: 'bookish' } },
      });
    }
    assert.fail(`Unexpected external request: ${path}`);
  };
  const source = await readFile(new URL('../../supabase/functions/bookish-auth/index.ts', import.meta.url), 'utf8');
  // Execute the deployed route, replacing only its imported transport dependencies.
  vm.runInNewContext(stripTypeScriptTypes(source).replace(/^import .*;$/gm, ''), {
    bookishAuthHandler,
    authAdmin: (url, key) => authAdmin(url, key, fetcher),
    readBookishSecret: createSecretReader({ env: name => env[name], fetcher }),
    sb: { rpc: async (name) => {
      rpcRequests.push(name);
      if (name === 'bookish_auth_throttle') return { data: true, error: null };
      if (name === 'bookish_auth_lookup') return { data: { id: 'bookish', bookish: true }, error: null };
      assert.fail(`Unexpected RPC: ${name}`);
    } },
    sendEmail: () => assert.fail('Email must not be sent without email configuration'),
    fetch: fetcher,
    AbortSignal,
    Deno: { env: { get: name => env[name] }, serve: callback => { handler = callback; } },
  });
  return { handler, secretReads, authRequests, rpcRequests };
}

for (const body of [
  { action: 'password', email: 'reviewer@example.test', password: 'fixture-password' },
  { action: 'verify', email: 'reviewer@example.test', token: '123456' },
  { action: 'refresh', refresh_token: 'fixture-refresh' },
  { action: 'logout' },
]) {
  test(`deployed ${body.action} route never reads email secrets`, async () => {
    const { handler, secretReads } = await deployedAuth();
    const request = req(body);
    if (body.action === 'logout') request.headers.set('authorization', 'Bearer fixture-access');
    const response = await handler(request);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
    assert.deepEqual(secretReads, []);
  });
}

test('deployed start route rejects missing email secrets before creating an identity or generating a code', async () => {
  const { handler, secretReads, authRequests, rpcRequests } = await deployedAuth();
  const response = await handler(req({ action: 'start', email: 'reviewer@example.test' }));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {ok:false,message:'Email codes are not available right now. Try again soon.'});
  assert.ok(secretReads.length > 0);
  assert.deepEqual(authRequests, []);
  assert.ok(!rpcRequests.includes('bookish_auth_lookup'));
});
