import fs from 'node:fs';
import path from 'node:path';
import { STORE_URLS } from './store-downloads.mjs';

// Build-time guard, including noindex pages, redirect fallbacks, and app shells.
export function checkStorePages(directory, stores = STORE_URLS) {
  const allowed = new Set(Object.values(stores).filter(Boolean));
  let pages = 0;
  for (const file of fs.readdirSync(directory, { recursive: true })) {
    if (!file.endsWith('.html')) continue;
    const html = fs.readFileSync(path.join(directory, file), 'utf8');
    if ((html.match(/\bdata-store-downloads(?=[\s>])/g) || []).length !== 1) {
      throw new Error(`${file}: expected one Get the app block`);
    }
    for (const tag of html.matchAll(/<a\b[^>]*>/gi)) {
      const value = tag[0].match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      if (!value) continue;
      const entities = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', colon: ':', sol: '/', period: '.' };
      const href = (value[1] ?? value[2] ?? value[3]).replace(/&(?:amp|quot|apos|lt|gt|colon|sol|period);|&#(?:x[a-f\d]+|\d+);/gi, entity => {
        if (!entity.startsWith('&#')) return entities[entity.slice(1, -1).toLowerCase()];
        const point = /^&#x/i.test(entity) ? parseInt(entity.slice(3, -1), 16) : parseInt(entity.slice(2, -1), 10);
        return point <= 0x10ffff ? String.fromCodePoint(point) : entity;
      });
      let url;
      try { url = new URL(href, 'https://bookish.invalid'); } catch { continue; }
      if (['apps.apple.com', 'play.google.com'].includes(url.hostname) && !allowed.has(href)) {
        throw new Error(`${file}: store destination is not in STORE_URLS`);
      }
    }
    pages++;
  }
  if (!pages) throw new Error('No generated HTML pages to check');
  console.log(`Store handoff checked: ${pages} pages.`);
  return pages;
}
