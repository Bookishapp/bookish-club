# Bookish iMessage Extension Implementation Plan

> **For agentic workers:** Use executing-plans for implementation, with independent sticker, model, and project integration tasks delegated.

**Goal:** Add an embedded Messages extension for RSVP, book votes, and a shared bookmark shelf, plus a replaceable Lunair sticker pack.

**Architecture:** Swift and UIKit render a native extension and MSMessageTemplateLayout images. Versioned, bounded message URLs carry local state; responses reuse the selected MSSession. There is no backend dependency. Existing App Group data is reused only if the host already exposes it.

**Tech Stack:** Capacitor 7 host, iOS 16, Swift 5, UIKit, Messages, and asset catalogs.

**Spec:** User brief for mockup decision 291, supplied on 2026-10-21.

## Global Constraints

- No database writes, new tables, spending, uploads, mockup replies, or pin resolution.
- No emoji, competitive framing, or em dash. Use the Oxford comma.
- Cream paper, pastel accents, wine ink/buttons, and one replaceable theme and asset catalog.
- Reuse the host bundle prefix and signing configuration. Document manual Apple setup.
- Commit on feat/imessage-extension, push, open a PR to main, and do not merge.

## Review Focus

- Malformed, oversized, or unsupported message payloads must not crash the extension.
- A response from the same participant replaces their prior choice and reuses its session.
- Selecting an older message and receiving a newer one must preserve known responses.
- Vote counts and bookmark positions must not rank members.
- Insert failures and canceled sends must not present unsent responses as delivered.

## Tasks

- [x] Model: Write behavior tests for URL round trips, invalid payloads, response replacement, and merge behavior, then implement MessageState.swift.
- [x] UI: Add MessagesViewController.swift, BookishTheme.swift, CardRenderer.swift, and ClubDataStore.swift. Handle selection, receive, insertion, cancellation, compact layout, and expanded layout.
- [x] Assets: Add replaceable placeholder art, color assets, and a correctly sized sticker pack with clear drop-in names.
- [x] Project: Embed one Messages extension with cards and stickers, add a separately buildable sticker pack target and schemes, reuse host signing settings, and document Apple steps. Simulator installation rejects two embedded Messages providers. Adopt the scene lifecycle required by iOS 27 while preserving Capacitor callbacks.
- [x] Verify: Run model tests, cd app && npm test, simulator builds for App, BookishMessages, and BookishStickers, and a whole-change review. All pass, including installation and host launch.
- [ ] Deliver: Commit, push, create PR, and write the short CODEX-IMESSAGE-REPORT.md in the requested job directory.
