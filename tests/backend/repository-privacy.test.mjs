import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

async function trackedFiles() {
  const { execFileSync } = await import('node:child_process');
  const root = new URL('../../', import.meta.url);
  return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0').filter(Boolean).map(name => ({ name, file: new URL(name, root) }));
}

test('tracked files contain no personal machine paths', async () => {
  const leaks = (await trackedFiles()).filter(({ file }) => fs.existsSync(file)
    && /\/Users\/[A-Za-z0-9_.-]+/.test(fs.readFileSync(file, 'utf8')));
  assert.deepEqual(leaks.map(({ name }) => name), []);
});

test('tracked files contain no private operations workspace references', async () => {
  const marker = ['ted', 'ops'].join('-');
  const leaks = (await trackedFiles()).filter(({ file }) => fs.existsSync(file)
    && fs.readFileSync(file).includes(marker));
  assert.deepEqual(leaks.map(({ name }) => name), []);
});

test('release implementation plans stay outside the public repository', async () => {
  const plans = (await trackedFiles()).filter(({ name, file }) =>
    /^docs\/superpowers\/plans\/2026-11-0[56]-/.test(name) && fs.existsSync(file));
  assert.deepEqual(plans.map(({ name }) => name), []);
});
