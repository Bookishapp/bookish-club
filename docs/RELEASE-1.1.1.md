# Bookish 1.1.1 release candidate

Includes PRs #36, #38, #39, #40, #41, #42, and #43. The release branch starts from approved art v3 and merges main, tagline, four-digit codes, and Android in that order with merge commits.

All iOS targets use 1.1.1 (7). App Store Connect read-only inspection found maximum build 6. The widget now matches the iPhone-only containing app. Android uses 1.1.1 (2), minimum API 24, and target API 36.

## Backend handoff for Ted

Target only hosted Bookish project `tkrsrnlasinmlftkcufi`. Existing foundation SQL 001 through 011 is a prerequisite. Review `supabase/checks/bookish-tea-preflight.sql` and back up the relevant production data first. Apply each currently absent file once, in this exact order:

1. `supabase/sql/012_bookish_auth_codes.sql`
2. `supabase/migrations/20261105000100_bookish_tea.sql`
3. `supabase/migrations/20261105000200_bookish_hosting.sql`
4. `supabase/migrations/20261105000300_bookish_reminders.sql`
5. `supabase/migrations/20261106000100_bookish_library.sql`

After all five SQL files succeed, deploy functions from this release branch in this order, with the repository's `verify_jwt = false` settings:

1. `bookish-auth`, including its updated shared handler. SQL 012 must precede this deployment.
2. `bookish-meeting-calendar`.
3. `bookish-meeting-reminders`, including its shared handler. Reminder SQL must precede both meeting functions.

Keep the existing `RESEND_API_KEY` and `BOOKISH_EMAIL_FROM` configuration. The reminder function additionally requires environment-only `BOOKISH_REMINDER_WORKER_KEY`, at least 32 characters. A separately authorized periodic worker on the Mac mini is still needed for automatic day-before emails. This branch installs no schedule. No other edge function source changed relative to main.

## Compatibility and release gates

The four-digit email flow does not sign in against the current hosted legacy auth handler. The client sends `short:true`, but the old handler ignores it, emails a legacy code, and rejects four-digit verification. The client deliberately has no six-digit fallback. Existing password accounts can still use the independent password flow. Deploy SQL and functions before making the client available for normal sign-in.

The current Apple profiles do not provision the App Group or the new Messages and Widgets extensions. A signed archive fails, and an unsigned archive exported through the old app profile creates an invalid IPA. Apple validation reports 90166 for both extensions. Obtain correct distribution profiles, including App Group support for the app and widget, then archive, export, and validate again. No iOS upload or App Store version change is part of this task.

The live lander promises thread interactions and automatic reminders. Server-backed card actions open Bookish for private actions; Android shares links. Automatic emails also need the worker schedule above. Resolve these parity gaps before any public store shipment. The live lander still has old plot-twist copy, while the release source includes the new tagline sweep. This task does not deploy the site.

## Integration regressions covered

Four-box entry, numeric paste truncation, leading-zero auth, HTTP 429 copy, Android map guards and Google Maps links, card sharing through the Android share sheet, shared message link parsing, reminder-primer Back handling, and Android calendar payload validation are covered. Calendar files use the existing app FileProvider and a temporary cache file. Simulator fixture scripts are opt-in and compile only into simulator Debug builds.

The v3 Messages renderer, RSVP safe crop, and wordmark fixes remain unchanged.
