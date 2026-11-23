import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
  .split('\0').filter(Boolean);

function filesContaining(markers) {
  return tracked.filter(name => {
    const content = fs.readFileSync(path.join(root, name));
    return markers.some(marker => content.includes(marker));
  });
}

test('tracked files contain no personal machine paths or account names', () => {
  const account = ['va', 'hallo'].join('');
  const leaks = filesContaining([['/Users', account].join('/'), account]);
  assert.deepEqual(leaks, [], 'Personal paths and account names must stay outside the repository.');
});

test('tracked files contain no private operations workspace references', () => {
  const leaks = filesContaining([['ted', 'ops'].join('-'), ['ted', 'state'].join('-')]);
  assert.deepEqual(leaks, [], 'Private workspace references must stay outside the repository.');
});

test('internal plans and working directories are never tracked', () => {
  const internal = tracked.filter(name => name.startsWith('docs/superpowers/') || name.startsWith('.ted/'));
  assert.deepEqual(internal, [], 'Internal plans and working files must stay outside the repository.');
});
