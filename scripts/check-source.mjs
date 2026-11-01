import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const files = ['src', 'scripts'].flatMap(dir => fs.readdirSync(dir, { recursive: true }).filter(file => /\.(mjs|js)$/.test(file)).map(file => `${dir}/${file}`));
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status || 1);
  }
}
console.log(`JavaScript syntax checked: ${files.length} files.`);
