import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const root = new URL('../',import.meta.url);
const pkg = JSON.parse(fs.readFileSync(new URL('package.json',root)));
for(const name of Object.keys(pkg.dependencies)) {
  const installed = require(`${name}/package.json`);
  assert.equal(installed.version.split('.')[0],'7',`Restore Capacitor 7 before releasing: ${name} is ${installed.version}`);
}
const iconDir=new URL('ios/App/App/Assets.xcassets/AppIcon.appiconset/',root);
const icons=JSON.parse(fs.readFileSync(new URL('Contents.json',iconDir)));
assert.ok(icons.images.some(i=>i.filename&&fs.existsSync(new URL(i.filename,iconDir))),'Add the designer’s 1024×1024 opaque PNG to the app icon slot before a release build.');
assert.ok(fs.existsSync(new URL('package-lock.json',root)),'Generate the app lockfile with npm install before releasing.');
console.log('Release prerequisites present: Capacitor 7 dependencies, designer app icon, npm lockfile.');
