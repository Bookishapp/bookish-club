#!/usr/bin/env node
// Source: bookclubs-com (https://bookclubs.com)
// Status: NOT USED — compliance guard. Checked 2026-10-13.
// Bookclubs.com Terms of Use (https://bookclubs.com/terms-of-use, last modified 12/5/22) section 7 prohibits using "any robot, spider, or other automatic device, process, or means to access the Website for any purpose, including monitoring or copying any of the material on the Website" and any "manual process to monitor or copy any of the material on the Website" without prior written consent.
// See data/raw/bookclubs-com.SOURCES.md. This script deliberately makes NO network requests.
// It writes an empty record set so downstream merge steps run unchanged.
// To enable it, first get written permission from the site owner, record it in the
// SOURCES.md file, then replace this guard with a real collector (throttle 1 req / 2s,
// User-Agent "BookishClubDirectory/0.1 (public book club listings; contact via site)",
// cache raw responses under .cache/bookclubs-com/).
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_ID = 'bookclubs-com';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'data', 'raw', `${SOURCE_ID}.json`);

const records = [];
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(records, null, 2) + '\n');
console.error(`[${SOURCE_ID}] not collected: the site's terms prohibit automated collection (see data/raw/${SOURCE_ID}.SOURCES.md). Wrote ${records.length} records to ${OUT}`);
