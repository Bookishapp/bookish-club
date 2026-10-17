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
- [ ] Add UI assertions for Me, nested Resources, back navigation, and preserved legal/refresh controls.
- [ ] Run the UI test and observe failure on the missing Me control.
- [ ] Replace About with Me, and add a Resources subpage linking the existing resource guides.
- [ ] Run unit tests, build, and UI smoke tests.

## Task 2: Anonymous Vote Boundary and Handoff

Files: `app/src/votes.ts`, `app/tests/votes.test.ts`, `app/README.md`, external full-app NOTES.md, and external backend `votes-anonymous.md`.
Interfaces: `loadAnonymousVote(rpc, voteId)` calls only `bookish_vote_tally(p_vote)` and `bookish_my_vote(p_vote)`, and returns option/book IDs, counts, total, and the caller's option ID. `renderAnonymousVote(vote, bookTitles)` shows totals and Your vote, with no voter identity.
- [ ] Write tests for aggregate projection, own choice, zero totals, unexpected identity fields, malformed/raw ballots, invalid input, and safe copy/errors.
- [ ] Observe failure before implementing the module.
- [ ] Implement strict aggregate validation, allowlist projection, generic errors, and escaped rendering.
- [ ] Mark all three calls decided, and document exact database, RPC, Realtime, and adversarial test requirements. These external files are authorized deliverables outside the worktree.
- [ ] Run the full app tests, UI smoke tests, release check, Capacitor sync, and a simulator build.
- [ ] Request a fresh review, address substantive findings, and open the iOS PR without merging.

## Execution Notes

The request already authorizes implementation and PR creation. Execute inline without another approval round. The vote adapter and renderer are preparatory code, with no live route until the separate club UI and authenticated backend are available. Document that limit in the PR and final report.
