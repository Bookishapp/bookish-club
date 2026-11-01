# Bookish for iOS

An independent Vite/TypeScript app UI backed by Capacitor 7, with an iOS 16 native
project in `ios/`. The app loads its own local bundle; there is no remote website
as the application UI and no `server.url` setting.

```sh
cd app
npm install
npm run build
LANG=en_US.UTF-8 npx cap sync ios
npm run ios
```

`npm run dev` serves the browser preview at `http://127.0.0.1:4321`, an origin the
existing form backend already allows. The browser can preview city selection,
saves and Read next; notification scheduling and the embedded MapKit sheet are
iOS features. Map links work in both. Native HTTP makes public-data and form calls
without changing backend CORS rules. No accounts, secrets or API keys are needed.

Refresh the offline snapshot intentionally after generating site data:

```sh
# repository root
SITE_URL=https://meetbookish.com node scripts/build.mjs
cd app
npm run snapshot
npm run build
LANG=en_US.UTF-8 npx cap sync ios
```

The snapshot command consumes the site's `dist/data/clubs.json` and community
aggregates when present, otherwise the already privacy-filtered `data/clubs.json`
with every club unverified and empty community statistics. It uses the existing
66-book catalog and copies the locked site theme, fonts and wordmark 04. It never
reads `data/raw/`, fetches Open Library metadata, or bulk-downloads book covers.

At launch/resume, data refreshes from `https://meetbookish.com/data/`. Each feed is
validated before replacing its local copy; partial failures preserve usable data.
Favorites, taste, snapshots and reminder records use native Preferences (browser
localStorage for previews). Live location is held in memory only. The embedded
MapKit plugin is in `BookishMapPlugin.swift` and registered by
`BookishViewController.swift`; preserve that storyboard subclass when updating
Capacitor. Local notifications store one reminder per club, use device local time
for entry, and carry the club ID so a notification tap opens its detail.

```sh
npm test                 # pure data/ranking/date tests
npm run test:ui          # shipped bundle in a DOM + mocked native bridge
npm run check:release    # major-7 packages, lockfile and real icon required
```

See [RESULT.md](../RESULT.md) for tested behavior and environment limitations, and
[CODEMAGIC.md](CODEMAGIC.md) for the draft TestFlight pipeline.


October 16 product calls: the Me tab contains Resources, including links to the
existing discussion guides, hosting tips, pairings, and printables. There is no
separate Resources tab. Sticker captions remain baked into art for v1.

Club votes are anonymous for members, creators, and club admins. `src/votes.ts`
provides `loadAnonymousVote(rpc, voteId)` and `renderAnonymousVote(vote, bookTitles)`
for the upcoming club UI. The transport must unwrap successful RPC data and throw
on a backend error. It calls only `bookish_vote_tally({p_vote})` (rows containing
`option_id`, `book_id`, and `ballots`) and `bookish_my_vote({p_vote})` (the caller's
option UUID, or null). It never accepts a target user ID, fetches raw ballots,
joins voter profiles, or forwards backend error text. Extra response fields are
discarded before rendering totals and the caller's own choice.

This finder baseline has no authenticated club screens or voting route yet.
The vote module is tested preparatory code, and is not connected to a live backend
or included in the finder bundle. Integrate it with an authenticated transport when
the club UI ships. Both RPCs require membership checks and database enforcement;
client filtering alone does not make votes anonymous. Fetch totals and own choice
again after casting, and retry a load if concurrent changes cause an inconsistent
snapshot. Do not introduce voter lists, avatars, names, ballot-table subscriptions,
identity-bearing cache entries, or creator/admin exceptions during integration.
