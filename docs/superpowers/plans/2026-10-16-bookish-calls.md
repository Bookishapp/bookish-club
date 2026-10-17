# Bookish October 16 Calls Implementation Plan

> For agentic workers: use superpowers:executing-plans to implement these tasks.

**Goal:** Put Resources in Me, and establish an identity-free vote client for the forthcoming club UI.
**Architecture:** Keep the existing Capacitor finder intact. Replace About with Me, give it a Resources subpage, and provide a tested vote RPC adapter and totals renderer. The merged app has no club authentication, voting screen, iMessage extension, or sticker target yet, so do not invent a live backend connection or claim those features ship here.
**Tech Stack:** TypeScript, Vite, Capacitor 7, Node tests, JSDOM, and Xcode.
**Spec:** Sebastian's October 16 request, and the decided calls in the full-app NOTES.md.

## Global Constraints

- Work only in the dedicated worktree on `ted/bookish-calls-1016`, based on `origin/main`.
- Never push to PR #15's branch or change its working files.
- Members, creators, and club admins see totals and their own choice only.
- No voter names, IDs, avatars, ballot rows, or identity-bearing errors in vote presentation.
- No em dashes. Use the Oxford comma.
- Keep sticker captions baked into art for v1. No sticker changes requested.
- Open a PR, run build/tests, and do not merge.

## Review Focus

- Resources must remain reachable after leaving and returning to Me.
- Preserve privacy, terms, source links, and directory refresh.
- Reject raw ballots, invalid totals, duplicate options, and an own choice outside the vote.
- Discard identity fields even if a server mistakenly adds them to aggregate responses.
- Do not imply database anonymity is complete before the backend worker verifies enforcement.

## Task 1: Me and Resources

Files: `app/src/main.ts`, and `app/tests/ui-smoke.mjs`.
- [x] Add UI assertions for Me, nested Resources, back navigation, and preserved legal/refresh controls.
- [x] Run the UI test and observe failure on the missing Me control.
- [x] Replace About with Me, and add a Resources subpage linking the existing resource guides.
- [x] Run unit tests, build, and UI smoke tests.

## Task 2: Anonymous Vote Boundary and Handoff

Files: `app/src/votes.ts`, `app/tests/votes.test.ts`, `app/README.md`, external full-app NOTES.md, and external backend `votes-anonymous.md`.
Interfaces: `loadAnonymousVote(rpc, voteId)` calls only `bookish_vote_tally(p_vote)` and `bookish_my_vote(p_vote)`, and returns option/book IDs, counts, total, and the caller's option ID. `renderAnonymousVote(vote, bookTitles)` shows totals and Your vote, with no voter identity.
- [x] Write tests for aggregate projection, own choice, zero totals, unexpected identity fields, malformed/raw ballots, invalid input, and safe copy/errors.
- [x] Observe failure before implementing the module.
- [x] Implement strict aggregate validation, allowlist projection, generic errors, and escaped rendering.
- [x] Mark all three calls decided, and document exact database, RPC, Realtime, and adversarial test requirements. These external files are authorized deliverables outside the worktree.
- [x] Run the full app tests, UI smoke tests, release check, Capacitor sync, and a simulator build.
- [x] Request a fresh review, address substantive findings, and open the iOS PR without merging.

## Execution Notes

The request already authorizes implementation and PR creation. Execute inline without another approval round. The vote adapter and renderer are preparatory code, with no live route until the separate club UI and authenticated backend are available. Document that limit in the PR and final report.


## Verification and Review Record

- Baseline: existing 4 unit tests, production build, and UI smoke passed.
- New navigation assertions failed on About instead of Me before implementation.
- New vote tests failed on the missing votes module before implementation.
- Final: 8 unit tests, TypeScript, production build, UI smoke, release prerequisites,
  and Capacitor/CocoaPods sync passed.
- Xcode 27.1 simulator build initially failed because generated Capacitor Pods target
  iOS 14, below this SDK's supported minimum. With a build-only
  `IPHONEOS_DEPLOYMENT_TARGET=16.0` override, the App simulator build passed.
  No deployment-target source changes were made. Third-party deprecation and
  script-phase warnings remain. The project has no native XCTest target.
- Independent read-only review of `fb917cd..9e24fa5`: no Critical or Important
  findings. Corrected one external NOTES wording issue so it cannot imply this
  branch is already merged. No deferred source findings.
- Scope decision: voting remains preparatory because the merged app has no club
  auth or vote route. Live anonymity requires the separate backend and club UI
  integration. This limitation must remain explicit in the PR and final report.
- External NOTES and backend handoff are saved at the requested paths, and contain
  no em dashes. The backend branch was neither edited nor pushed.

- Simulator installation and process launch succeeded. Simulator bootstatus reported
  a data-migration failure, and the computer-use bridge could not select Simulator.
  Native visual interaction was not verified. JSDOM exercised the Me and Resources
  flows, including mocked native bridges.

- Final CI inspection found the existing simulator screenshot launch hook and
  workflow still named About. Updated both to Me so native screenshot coverage
  follows the renamed tab. This is a QA configuration follow-through, with no
  release behavior change. Rebuilt the native target after this update.
