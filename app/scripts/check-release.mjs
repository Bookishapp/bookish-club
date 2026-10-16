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
const source=fs.readFileSync(new URL('assets/icon-only.png',root));
assert.ok(icons.images.some(i=>i.idiom==='ios-marketing'&&i.size==='1024x1024'&&i.scale==='1x'),'App Store marketing icon is required.');
for(const icon of icons.images) {
  assert.ok(icon.filename,`Missing filename for ${icon.idiom} ${icon.size} ${icon.scale}`);
  const png=fs.readFileSync(new URL(icon.filename,iconDir));
  const pixels=Number(icon.size.split('x')[0])*Number(icon.scale.replace('x',''));
  assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a',`${icon.filename} must be a PNG`);
  assert.equal(png.readUInt32BE(16),pixels,`${icon.filename} width`);
  assert.equal(png.readUInt32BE(20),pixels,`${icon.filename} height`);
  assert.equal(png[25],2,`${icon.filename} must be RGB without alpha`);
  // RGB PNGs can still carry transparency in a tRNS chunk.
  for(let offset=8;offset<png.length;) {
    assert.notEqual(png.toString('ascii',offset+4,offset+8),'tRNS',`${icon.filename} must be opaque`);
    offset+=png.readUInt32BE(offset)+12;
  }
  if(pixels===1024) assert.deepEqual(png,source,'Marketing icon must match the selected source artwork.');
}
assert.ok(fs.existsSync(new URL('package-lock.json',root)),'Generate the app lockfile with npm install before releasing.');
console.log('Release prerequisites present: Capacitor 7 dependencies, selected opaque app icons, npm lockfile.');
