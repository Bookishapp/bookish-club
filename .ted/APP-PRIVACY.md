# App Privacy answers for Bookish 1.1

Prepared November 1, 2026, for app 6823470101, bundle com.meetbookish.app. This describes the full account and club release source. It supersedes the five-category guest-only answers prepared for Bookish 1.0 (3). No App Store Connect answers or production services were changed by this task. The release owner must reconcile this file with the final archive and deployed backend before publishing updated answers.

Privacy Policy URL: https://meetbookish.com/privacy/

User Privacy Choices URL: https://meetbookish.com/support/

Do you or your third-party partners collect data from this app? **Yes.** Guest browsing remains available, but accounts, club membership, moderation, and collaboration transmit and retain personal data. Optional features do not qualify this release for an all-data optional-disclosure exemption.

Select these eight data types. For every row choose **App Functionality only**, **Yes, linked to the user's identity**, and **No tracking**. Leave advertising, marketing, analytics, product personalization, and other purposes unchecked.

| Apple data type | Collection in this release |
| --- | --- |
| Contact Info: Name | Profile display name and name supplied with a join request. |
| Contact Info: Email Address | Bookish sign-in email, email correspondence, and join requests. Resend delivers one-time sign-in codes and requested notices. |
| Contact Info: Physical Address | Member-only meeting location text can contain a physical meeting address, including a host's home address. Public discovery never exposes that location. This conservative disclosure reflects the permitted free-text field, even if many clubs use only a venue name. |
| Location: Coarse Location | Optional home city stored in an account profile, and submitted club city. This does not mean device GPS is uploaded. |
| Identifiers: User ID | Bookish Auth identifier and profile ID, linked membership and roles, request ownership, session/account linkage, ballots, and moderation author connections. |
| User Content: Emails or Text Messages | Join notes addressed to a host, support correspondence, and club comments or replies when those tools are used. |
| User Content: Other User Content | Club descriptions and settings, memberships and requests, book selections and nominations, meetings, RSVPs and bring claims, reading progress and ratings when used, votes, report reasons, hidden-content choices, and blocks. |
| Other Data: Other Data Types | Hashed IP/email values for authentication abuse controls and hashed IP values stored with form submissions. These are service-security records, not anonymous data when associated with an account or submitted email. |

Do not label ballots or club comments as unlinked merely because member-facing screens hide the author. The backend retains account linkage to enforce one ballot per reader, handle safety, and delete authored records. Reports and blocks also retain user linkage.

## Data that stays on the device

Do not select collected precise location for optional device geolocation. It sorts nearby cities in memory and is not uploaded or persisted by Bookish. The remote profile home city and member meeting location are disclosed separately above. Public map positions are city-level.

Saved clubs, saved books, recommendation preferences, browsing city, and local reminders remain device-only, even when signed in. Local recommendations do not upload taste. Account credentials are stored on the device for the session. Reminders use local notifications, not an APNs push backend.

No payments, prices, subscriptions, purchase history, advertising identifiers, contacts access, camera, microphone, uploaded photos, health data, or developer analytics are included in this release. There is no third-party or social login. Authentication uses an email one-time code through a Bookish-specific edge function, without changing the shared project's Auth settings. An optional password sign-in accepts an existing Bookish account password, including the reviewer account. Supabase Auth verifies that credential; Bookish does not store it in device preferences, logs, or application tables.

The sticker-only Messages extension collects no data. Apple handles Messages delivery. Interactive iMessage club screenshots on the website remain labelled previews, rather than a claim that the sticker extension provides those features.

## Deletion and retention

In-app route: **Me > Account settings > Delete my account > type DELETE > confirm**. The edge verifies the authenticated user and requires trusted `app_metadata.app = 'bookish'`. User-editable metadata is not sufficient. A Fictora identity cannot enter the Bookish deletion path.

Deletion removes the Bookish-marked Auth identity and related Bookish personal rows, including profile, memberships, requests, ballots, authored Tea content, and associated blocks and reports. Owned clubs transfer to a remaining member when possible, or are deleted when empty. Shared club records can remain for continuing members. Local favorites are separately removable on the device. Do not promise deletion of copies other members have already saved, every safety audit record, or all provider backups.

Account sign-in abuse controls retain SHA256 email/IP hashes and prune entries older than 30 days when the control executes. Older website form submissions have no verified blanket expiry. The policy provides `hello@meetbookish.com` for access, correction, deletion of older website submissions, or help with an unavailable account flow. No test email was sent, and inbox delivery/monitoring has not been verified in this task.

## Networking and evidence

Supabase retains account, club, and safety data. Resend handles one-time code and requested-notice email delivery. Open Library cover requests contain ordinary connection information and requested cover IDs; the app does not attach saved items, taste, account IDs, or device coordinates. Maps and external organizer links use the destination's own policy. Website claim/start submissions also store user-agent information; the legacy native join path does not persist user-agent information.

Source reviewed: `app/src/account.ts`, `app/src/native.ts`, `app/src/main.ts`, `supabase/sql/005_bookish_accounts_clubs.sql`, `supabase/sql/006_bookish_reading_meetings_votes.sql`, `supabase/sql/007_bookish_tea_moderation_deletion.sql`, the Bookish 1.1 backend additions, `supabase/functions/_shared/account-deletion.ts`, and the prior submission audit. The main app's `PrivacyInfo.xcprivacy` declares the same eight linked App Functionality categories, tracking false, and the existing UserDefaults reason CA92.1.

Apple's collection definition includes data transmitted off-device and retained beyond servicing the immediate request. Its labels distinguish member-facing anonymity from actual identity linkage. Checked November 1, 2026: [App privacy details](https://developer.apple.com/app-store/app-privacy-details/). Account deletion, privacy, and user-content requirements were checked against [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/). These are source-based answers, not a claim of Apple approval.

## Release handoff

Deploy and verify the updated public privacy and support pages before using their URLs for the account release. Deploy and validate the Bookish-specific backend before advertising shared club features as available. Check the final native archive's frameworks, privacy manifests, network behavior, exact deletion route, report/block controls, and eight-category parity. This file does not assert that production was deployed, the labels were published, or an account deletion was executed in production.
