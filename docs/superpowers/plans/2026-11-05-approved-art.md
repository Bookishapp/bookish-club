# Approved Bookish Art Implementation Plan

> **For agentic workers:** Use the approved ticket as the binding spec, preserve working behavior, and verify each deliverable.

**Goal:** Bring every existing app surface and the iMessage extension into the approved Bookish visual system, with reproducible parity evidence and a draft PR.

**Architecture:** Keep the existing TypeScript flow handlers, privacy enforcement, native integration, and Swift message state. Add shared CSS tokens and presentation helpers, then apply them to the current views. Review fixtures stay outside the production bundle.

**Tech Stack:** Vite, TypeScript, Capacitor, UIKit, Messages, Google Chrome, and iOS Simulator.

**Spec:** `/Users/vahallo/biz/bookish/design/APPROVED-ART.md` and the user ticket. The ticket already authorizes implementing the approved design and opening a draft PR.

## Global Constraints

- Oct 19 v2 overrides win. Working fields, legal strings, privacy, and behavior win over mock data.
- No emoji, em dash, reading competition, scores, or leaderboard. Use proper capitalization and the Oxford comma.
- No new Tea, bring list, reminders, or widgets. Preserve existing reminder behavior.
- Use the existing isolated `feat/approved-art` workspace. Do not merge, deploy, or access App Store Connect.
- Do not read or list the user's Documents, Downloads, Desktop, or Pictures directories.
- Use Google Chrome for all browser verification.

## Review Focus

- Email code autofill, paste, and validation must support four and six digits while keeping the existing backend compatible.
- Text expansion, long club names, errors, and narrow devices must scroll without obscuring actions.
- Meeting details, private clubs, anonymous votes, and safety controls must preserve existing access rules.
- Production must not contain fixture identities, review routes, or test credentials.
- Native Messages must preserve draft and committed state, send behavior, and accessibility.

### Task 1: Shared foundation and discovery surfaces

**Files:** `app/src/design.ts`, `app/src/tokens.css`, `app/src/styles.css`, `app/src/main.ts`, `app/public/art/`, and `app/DESIGN.md`.

- [x] Inventory the actual approved layouts, fonts, cutouts, and spot art.
- [x] Port exact approved palette, fonts, paper, radii, shadows, spacing, drawn icons, and optimized assets.
- [x] Restyle existing discovery, map, Read next, saved, profile, resources, public detail, and fallback states while retaining IDs and handlers.
- [x] Verify with app unit tests, UI smoke tests, typecheck, and iPhone Chrome captures.

### Task 2: Existing community screens

**Files:** `app/src/community.ts`, `app/src/community.css`, and focused UI validation if needed.

- [x] Restyle sign-in, email code, house rules v2, settings v2, create club, join request/sent v2, member views v2, votes, meeting, schedule, invite, safety, and account states.
- [x] Preserve every working form, legal string, RPC argument, access rule, and draft behavior.
- [x] Verify four- and six-digit code fields, guest/member/host flows, errors, and unit/UI suites.

### Task 3: Native iMessage surfaces

**Files:** `app/ios/App/BookishMessages/`, extension resource entries in the Xcode project if needed, and native parity artifacts.

- [x] Port approved palette, type, art, paper, transcript cards, sticker picker, and drawer icon.
- [x] Keep bookmarks communal and in member order, with no ranking.
- [x] Preserve native Messages transport and state, and build both simulator targets.

### Task 4: Parity, checks, review, and draft PR

**Files:** `docs/approved-art-parity/`, a reproducible Chrome capture script, and necessary fixture helpers outside production.

- [x] Capture approved and actual existing screens at 390 by 844. Cover empty, error, and loading states, and document screens represented by existing combined flows.
- [x] Produce a linked comparison page per screen and an index with source provenance and honest limitations.
- [x] Run repo lint, typecheck, tests, web/app builds, native simulator builds, and appropriate native tests.
- [x] Review the complete branch, fix material issues, commit with the requested trailers, push the task branch, and open a DRAFT PR against main.

Draft PR: https://github.com/Bookishapp/bookish-club/pull/40
