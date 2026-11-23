import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const scanner = 'tests/backend/repository-privacy.test.mjs';
const mutations = [
  ['private screenshot workspace', ['ted', 'screenshots'].join('-')],
  ['private Chrome helper', ['ted', 'chrome'].join('')],
  ['private mockup storage', ['ted', 'mockup'].join('-')],
];

for (const [label, marker] of mutations) {
  test(`privacy guard rejects a tracked ${label} reference`, () => {
    fs.mkdirSync(path.join(root, '.cache'), { recursive: true });
    const checkout = fs.mkdtempSync(path.join(root, '.cache', 'privacy-mutation-'));
    try {
      fs.mkdirSync(path.join(checkout, 'tests/backend'), { recursive: true });
      fs.copyFileSync(path.join(root, scanner), path.join(checkout, scanner));
      fs.writeFileSync(path.join(checkout, 'README.md'), '# Public project\n');
      execFileSync('git', ['init', '--quiet', checkout]);
      execFileSync('git', ['add', '--', scanner, 'README.md'], { cwd: checkout });
      const env = { ...process.env };
      delete env.NODE_TEST_CONTEXT;
      const run = () => spawnSync(process.execPath, ['--test', scanner], {
        cwd: checkout,
        env,
        encoding: 'utf8',
      });
      const clean = run();
      assert.equal(clean.status, 0, clean.stdout + clean.stderr);

      fs.appendFileSync(path.join(checkout, 'README.md'), `${marker}\n`);
      const leaked = run();
      assert.equal(leaked.status, 1, leaked.stdout + leaked.stderr);
      assert.match(leaked.stdout + leaked.stderr, /Private workspace references/);
      assert.match(leaked.stdout + leaked.stderr, /README\.md/);
    } finally {
      fs.rmSync(checkout, { recursive: true, force: true });
    }
  });
}
