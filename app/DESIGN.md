# Bookish design system

The source of truth is `src/tokens.css`. Components are in `src/styles.css`, account and club flow layouts are in `src/community.css`, and decorative art helpers are in `src/design.ts`. Future Tea and hosting screens should use these foundations.

The implementation follows the approved October 16 art and October 19 overrides described in `/Users/vahallo/biz/bookish/design/APPROVED-ART.md`. The original generator is `full-app-1016/src/base.py`. Drawn SVG geometry comes from `base.py`, `art81.py`, and the house rules in `screens1.py`. Approval provenance and screen comparisons are in [the parity report](../docs/approved-art-parity/index.html).

## Color

| Token | Value | Purpose |
| --- | --- | --- |
| `--paper` | `#f5ead8` | App canvas |
| `--card` | `#fffaf1` | Cards, fields, and light controls |
| `--ink` | `#2a0f15` | Primary text |
| `--mut` | `#6b4c46` | Supporting text |
| `--faint` | `#9a8279` | Decorative detail, never essential text |
| `--line` | `rgba(74,20,32,.12)` | Quiet dividers and borders |
| `--wine`, `--wine2` | `#7a1a2a`, `#4a1420` | Primary actions, accents, and deep wine |
| `--wineS` | `#f3d9d9` | Wine tint |
| `--pink`, `--pinkS` | `#f4a6bf`, `#fbe1e8` | Playful highlights and selected surfaces |
| `--mus`, `--musS` | `#ecb74e`, `#f9e6b8` | Mustard accent and tint |
| `--brass` | `#c08a26` | Decorative gold |
| `--green`, `--green2`, `--greenS` | `#1d5a46`, `#133b31`, `#dcebe1` | Membership, communal reading, and success |

Compatibility aliases such as `--ink-2`, `--note`, `--sage`, and `--rule` map to the same system. Do not import the website's older `public/theme.css` into new app views. The snapshot script may refresh website assets without changing the app tokens.

## Type

All fonts are self-hosted and available offline. Their SIL Open Font License texts ship in `public/fonts/`.

| Token | Family or size | Use |
| --- | --- | --- |
| `--title` | Young Serif, 400 | Warm editorial headings |
| `--ui` | Manrope, 400 to 800 | Body, labels, controls, and navigation |
| `--display` | Unbounded | Short numeric accents |
| `--mono` | Courier Prime, 700 | Small stamps and labels |
| `--font-title` | 34px | Page title |
| `--font-heading` | 25px | Section title |
| `--font-card` | 19px | Card title |
| `--font-body`, `--font-small` | 14px, 12px | Body and supporting text |

Use sentence case for copy, proper capitalization for names, the Oxford comma, and no em dash. Preserve legal text and privacy claims from the working app. Never add a feature promise merely because it appears in a mockup.

## Paper, layout, and shape

`--paper-texture` is the approved paper grain. `--paper-glow` layers a restrained pink glow at the top right and mustard at the bottom left. Wine textures are reserved for a surface whose approved reference uses wine.

The spacing scale is `--space-1` through `--space-6`, then `--space-8` and `--space-10`: 4, 8, 12, 16, 20, 24, 32, and 40px. Page gutters are 20 to 22px on iPhone. Content stays fluid, scrollable, and bounded by `--content-width` (600px). Do not port the mockup's fixed absolute screen coordinates or simulated status bar into the app.

`--radius-small` is 8px, `--radius-card` is 14px, `--radius-sheet` is 22px, and `--radius-pill` is 999px. `--shadow-card`, `--shadow-button`, and `--shadow-sheet` preserve the approved warm, soft shadows.

## Components

- `.primary` is a full-width wine pill, 52px minimum height. `.secondary` is an outlined pill. `.light-button` uses the pink tint. `.text-button` is an underlined text action.
- `.paper` and `.card` are cream cards with 14px corners and `--shadow-card`. A paper canvas is a background, not a card filled with another dark theme.
- `.chip` and `.status` are compact pills. `.chip.on` uses wine, and `.chip.g` uses the green tint. Labels must communicate state without relying on color.
- `.switch` and `.room-tabs` group existing views. Selection uses `aria-pressed`. `.tabs` uses `aria-current`, drawn icons, a cream background, and the small wine selection line.
- `dialog#detail` is the shared sheet container. Community flow layouts use its `data-community` attribute for their page treatment. Content scrolls, and close controls remain available. Preserve draft restoration and modal focus behavior.
- Inputs have cream backgrounds, quiet borders, 8px corners, 16px text, and visible focus rings. Labels are always real labels. Email code remains one accessible input for paste and autofill, with visual digit grouping that supports four and six digits, plus existing longer codes.
- `#toast` uses deep green, cream text, a rounded card, and a live status region. Inline `.form-message` errors use a pink tint and retain the original error handling.
- Empty and loading states use the same paper canvas, short warm copy, real retry actions, and a relevant approved cutout. Do not show an empty inventory when discovery is unavailable.

## Art

`icon(name)` returns approved outline SVG inside an `aria-hidden` wrapper. `spot(name, size)` returns the custom colored spot drawings. `art(name, className)` returns a decorative optimized Lunair cutout. Put accessible names on the containing control, not on duplicated decorative artwork. Use named helpers instead of emoji or platform symbol glyphs.

The 30 WebP cutouts in `public/art/` are bounded to 640px, retain alpha, and total about 1.6 MB. [Asset provenance](public/art/provenance.json) records each source, size, and byte count. Plain names come from the approved `cut/` set, derived from `gen/`; `b-` names are the approved Bible cutouts in `assets/lunair/`. Keep that distinction and use the Bible cutouts for Lunair. Do not generate a replacement character.

The native Messages theme mirrors the same palette, bundled typography, paper, and approved art in `ios/App/BookishMessages/BookishTheme.swift`. Native values cannot consume CSS, so changes to shared colors or typography must update both places and be checked in the simulator.

## Product rules

Reading is communal. Show bookmarks in member order, never as ranks, speed comparisons, scores, streaks, or leaderboards. Votes may show anonymous book totals, but never reveal another reader's ballot. Meeting locations remain private to approved members. Discovery shows city centers only.

No new Tea, bring list, reminder, or widget functionality belongs to this foundation. Existing local reminder fields and behavior remain available. Fixture identities, captures, and review data stay outside the production bundle.
