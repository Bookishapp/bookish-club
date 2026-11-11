# Bookish Android app content draft

Prepared November 5, 2026. These answers are a reviewable draft until saved in Play Console. Do not submit for review.

## Sources

- Live [iOS 1.1 listing](https://apps.apple.com/us/app/bookish-book-club-night/id6823470101).
- Apple App Privacy details: linked to identity, for App Functionality only: Coarse Location, Physical Address, Email Address, Name, Emails or Text Messages, Other User Content, User ID, and Other Data Types. No tracking disclosure.
- [Bookish privacy policy](https://meetbookish.com/privacy/), updated November 1, 2026.
- The shared `app/src/` implementation, including account, membership, voting, meeting, reporting, and deletion flows.

## Listing

`listing-en-US.json` preserves the iOS copy except for removing the iMessage-only sticker paragraph, and correcting the stale offline-directory claim to match live-only discovery. The app uses the selected iOS artwork. Use Android emulator screenshots for the phone gallery, `app/public/icons/icon-512.png` for the store icon, and `feature-graphic.png` for the 1024 by 500 feature image. No Android sticker or native MapKit functionality is claimed.

## Privacy policy and account deletion

- Privacy: `https://meetbookish.com/privacy/`.
- Web account-deletion path: `https://meetbookish.com/app/`, then Me, Account settings, and Delete my account. The privacy page also explains data deletion and support contact.
- In-app deletion: Me, Account settings, Delete my account, type DELETE, and confirm.
- Accounts can be created using an email code. Existing users can sign in with a password. There is no social sign-in.
- Transport uses HTTPS. Deletion is supported. Do not claim an automatic retention deadline for every record.
- The live policy's introductory platform list names website, web app, and iOS. Android has the same shared data behavior. A future approved site change should explicitly add Android; this ticket must not deploy the site.

## Data safety mapping

Answer that data is collected, encrypted in transit, and users can request deletion. No ads, tracking, analytics SDKs, sale of data, or advertising identifiers. Data is collected for app functionality, account management, and, for safety records, fraud prevention, security, and compliance. Service providers process data for Bookish; user-directed disclosure to hosts and fellow members is part of club functionality. Do not label service-provider processing or user-directed sharing as advertising or data sales.

| Google Play data type | Apple source and Bookish behavior | Required or optional |
| --- | --- | --- |
| Approximate location | Coarse Location: submitted profile home city and club city. Device GPS coordinates stay on the device. | Optional |
| Name | Name: account display name and join requests. | Required for account participation |
| Email address | Email Address: authentication, account, and requested email. | Required for an account |
| Address | Physical Address: host-entered meeting-place text, visible to club members. | Optional |
| User IDs | User ID: authenticated identity, membership, and ballot enforcement. | Required for an account |
| Other in-app messages | Emails or Text Messages: join notes and club correspondence where supported. | Optional |
| Other user-generated content | Other User Content: club descriptions, meetings, reports, and authored club content. | Optional |
| Other actions | Other Data Types: votes, memberships, terms and age confirmation, safety controls, and requests. | Required or optional according to the action |

Saved books, device reminders, recommendation preferences, and raw device coordinates remain on the device. No precise-location collection, contacts access, camera, microphone, photos, financial data, or health data is implemented. Collection here includes ordinary service connection metadata and abuse controls as described in the policy, rather than claiming the service receives no connection information.

## Content rating draft

Use the app category for a social or communication product because members interact through clubs. Provide `hello@meetbookish.com` for IARC correspondence.

- User interaction: Yes. Readers join clubs, share their display names, submit notes, vote on books, and view shared meetings.
- UGC: Yes. Club descriptions, join notes, meeting text, and moderation reports are user-entered. Report, block, and hide controls are available.
- Public precise location sharing: No. Public discovery shows city centers; member-entered private meeting text can include a venue or address. Answer any separate private-location question accordingly.
- Digital goods, real-money gambling, simulated gambling, contests with cash prizes, ads, purchases, and subscriptions: No.
- App-authored graphic violence, sexual imagery, nudity, profanity, drug use, or horror: No. The book catalog may contain adult literary themes. Do not promise all user-entered content is pre-reviewed or filtered before display.
- Unrestricted in-app web browser: No. Selected links open the external browser.
- Target audience: 18 and over, matching the account age confirmation and Bookish rules. Apple's public 13+ content rating is a separate result, and should not be copied as the intended audience.
- Do not guess or force an IARC age rating. Save a draft based on the exact questionnaire wording, and do not submit it.

## Internal testing

Tester: `(owner email, kept private)`. Only the INTERNAL track is authorized. No production release, closed release, review submission, site deployment, or function deployment is authorized.
