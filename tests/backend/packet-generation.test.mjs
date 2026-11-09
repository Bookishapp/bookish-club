import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import * as generator from '../../scripts/stage-dedicated-sql.mjs';

const root = new URL('../../', import.meta.url);
test('generated chunks cannot occupy reserved chunk 20 or any later number', () => {
  assert.equal(typeof generator.assertGeneratedChunkCount, 'function');
  generator.assertGeneratedChunkCount(19);
  for (const count of [20, 21, 100]) assert.throws(() => generator.assertGeneratedChunkCount(count), /reserved|20/i);
});

test('packet hash check works without a cache and rejects changed or missing review hashes', () => {
  const checkout = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bookish-packet-')));
  try {
    for (const file of ['scripts/stage-dedicated-sql.mjs', 'data/clubs.json', 'data/ref/places.json', 'supabase/sql', 'supabase/packets']) {
      fs.cpSync(new URL(file, root), path.join(checkout, file), {recursive: true});
    }
    const check = () => spawnSync(process.execPath, [path.join(checkout, 'scripts/stage-dedicated-sql.mjs'), '--check'], {encoding: 'utf8'});
    let result = check();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(path.join(checkout, '.cache')), false);
    const clubs = path.join(checkout, 'data/clubs.json');
    const original = fs.readFileSync(clubs, 'utf8');
    const changed = JSON.parse(original); changed[0].name += ' changed';
    fs.writeFileSync(clubs, JSON.stringify(changed));
    result = check();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /reviewed packet hash/i);
    fs.writeFileSync(clubs, JSON.stringify([...changed, ...changed]));
    result = check();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /reserved chunk 20/i);
    fs.writeFileSync(clubs, original);
    const manifest = path.join(checkout, 'supabase/packets/SHA256SUMS');
    fs.writeFileSync(manifest, 'invalid manifest\n');
    result = check();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /reviewed packet hash/i);
    fs.unlinkSync(manifest);
    result = check();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /reviewed packet hash/i);
    assert.doesNotMatch(result.stderr, /ENOENT/);
  } finally { fs.rmSync(checkout, {recursive: true, force: true}); }
});
