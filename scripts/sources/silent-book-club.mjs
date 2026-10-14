#!/usr/bin/env node
// Source: silent-book-club (https://silentbook.club)
// Status: NOT USED — compliance guard. Checked 2026-10-13.
// Silent Book Club Terms of Service (https://silentbook.club/policies/terms-of-service) prohibit using the site or its content "to spam, phish, pharm, pretext, spider, crawl, or scrape" and state that use of "any content on this website is prohibited without express written permission".
// See data/raw/silent-book-club.SOURCES.md. This script deliberately makes NO network requests.
// It writes an empty record set so downstream merge steps run unchanged.
// To enable it, first get written permission from the site owner, record it in the
// SOURCES.md file, then replace this guard with a real collector (throttle 1 req / 2s,
// User-Agent "BookishClubDirectory/0.1 (public book club listings; contact via site)",
// cache raw responses under .cache/silent-book-club/).
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_ID = 'silent-book-club';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'data', 'raw', `${SOURCE_ID}.json`);

const records = [];
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(records, null, 2) + '\n');
console.error(`[${SOURCE_ID}] not collected: the site's terms prohibit automated collection (see data/raw/${SOURCE_ID}.SOURCES.md). Wrote ${records.length} records to ${OUT}`);
