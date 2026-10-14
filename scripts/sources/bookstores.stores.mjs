// Store config for scripts/sources/bookstores.mjs.
// Each club below was read by hand from the listed page (fetched 2026-10-13) and is re-verified on
// every build: a club is kept only if `match` (default: name) still appears in that page's text.
// platform 'bookmanager' = React storefront; page text comes from the store's public content
// endpoint (api.bookmanager.com/customer, allowed by its robots.txt). Otherwise plain HTML.
// Vibes are short paraphrased facts; no host names, emails or phone numbers are stored.
// Kids/teen clubs, private clubs and one-off events are deliberately omitted.

const m = (n, day) => `Monthly, ${n} ${day}`;

export const STORES = [
  // ---------------- Washington DC metro ----------------
  {
    venue: 'East City Bookshop', city: 'Washington', state: 'DC', neighborhood: 'Capitol Hill',
    platform: 'bookmanager', home: 'https://www.eastcitybookshop.com/',
    pages: [{
      url: 'https://www.eastcitybookshop.com/book-clubs/adult-book-clubs',
      clubs: [
        { name: "CHILLY P's", genres: ['literary'], vibe: 'For readers in their 20s and 30s; recent award-listed titles', cadence: m('4th', 'Wednesday') },
        { name: 'ECB Fiction', genres: ['literary'], vibe: 'Fiction picks tied to themes that resonate with the neighborhood', cadence: m('1st', 'Monday') },
        { name: 'New Fiction', genres: ['literary'], vibe: 'Buzzy new literary fiction; often full with a waitlist', cadence: m('4th', 'Sunday') },
        { name: 'Queering the Narrative', genres: ['lgbtq'], vibe: 'LGBTQIA+ reads, one genre focus per month', cadence: m('3rd', 'Monday') },
        { name: 'Reading with Rory', genres: ['classics'], vibe: 'Working through books read on Gilmore Girls; bring your own coffee', cadence: m('2nd', 'Sunday') },
        { name: 'Reads and Reels', vibe: 'Read the book, watch the adaptation, discuss both', cadence: 'Every other month' },
        { name: 'Really Reading Romance', genres: ['romance'], vibe: 'New and traditional romance novels', cadence: m('3rd', 'Friday') },
        { name: 'Social Justice', match: 'Social Justice meets', genres: ['nonfiction'], vibe: 'Social justice reads', cadence: 'Monthly, last Tuesday' },
        { name: 'Stranger than Fiction', genres: ['nonfiction'], vibe: 'Nonfiction book club', cadence: m('3rd', 'Sunday') },
        { name: 'Well Read Black Girl', vibe: 'Local chapter of the national Well-Read Black Girl club', cadence: m('3rd', 'Sunday') },
        { name: 'W(h)ine & Angst', cadence: m('2nd', 'Friday') },
      ],
    }],
  },
  {
    venue: 'Old Town Books', city: 'Alexandria', state: 'VA', neighborhood: 'Old Town',
    platform: 'bookmanager', home: 'https://www.oldtownbooks.com/',
    pages: [
      { url: 'https://www.oldtownbooks.com/book-clubs/queer-book-club', clubs: [{ name: 'Queer Book Club', genres: ['lgbtq'], vibe: 'Stories by queer authors centered on queer life; free, RSVP', cadence: m('2nd', 'Friday') }] },
      { url: 'https://www.oldtownbooks.com/book-clubs/bad-romance-book-club', clubs: [{ name: 'Bad Romance Book Club', genres: ['romance'], vibe: 'One romance title a month, happy ending guaranteed', cadence: m('3rd', 'Friday') }] },
      { url: 'https://www.oldtownbooks.com/book-clubs/murder-by-the-book-club', clubs: [{ name: 'Murder by the Book Club', genres: ['horror', 'mystery-thriller'], vibe: 'Horror, thriller and true crime mix', cadence: 'Monthly' }] },
      { url: 'https://www.oldtownbooks.com/book-clubs/sci-fi-fantasy-book-club', clubs: [{ name: 'Sci-Fi & Fantasy Book Club', genres: ['sci-fi', 'fantasy'], vibe: 'Diverse SFF, often debut authors', cadence: m('4th', 'Friday') }] },
      { url: 'https://www.oldtownbooks.com/book-clubs/fiction-book-club', clubs: [{ name: 'Fiction Book Club', genres: ['literary'], vibe: 'Literary-leaning fiction pick each month', cadence: m('3rd', 'Tuesday') }] },
      { url: 'https://www.oldtownbooks.com/book-clubs/a-good-yarn-book-club', clubs: [{ name: 'A Good Yarn Book Club', vibe: 'Craft while you listen; bring your knitting or crochet', cadence: m('4th', 'Monday') }] },
    ],
  },
  {
    venue: 'Bards Alley', city: 'Vienna', state: 'VA', neighborhood: null, home: 'https://www.bardsalley.com/',
    pages: [{
      url: 'https://www.bardsalley.com/book-clubs.html',
      clubs: [
        { name: 'Queer Book Club', genres: ['lgbtq'], vibe: 'Queer lit across the LGBTQ+ spectrum and all genres', cadence: m('1st', 'Wednesday') },
        { name: 'Sci-Fi/Fantasy Book Club', genres: ['sci-fi', 'fantasy'], vibe: 'Current and classic SFF; currently at capacity', cadence: m('1st', 'Sunday') },
        { name: 'Mystery/Thriller Book Club', genres: ['mystery-thriller'], vibe: 'Twisty mysteries and thrillers; currently at capacity', cadence: m('2nd', 'Sunday') },
        { name: "Men's Book Club", vibe: 'Book discussion group for men', cadence: m('2nd', 'Monday') },
        { name: "Badass Women's Book Club", vibe: "Women's stories; currently at capacity", cadence: m('2nd', 'Wednesday') },
        { name: 'Contemporary Fiction Book Club', match: 'Contemporary Fiction', genres: ['literary'], vibe: 'Currently at capacity' },
        { name: 'Historical Fiction Book Club', match: 'Historical Fiction', genres: ['historical-fiction'], vibe: 'Currently at capacity' },
      ],
    }],
  },
  {
    venue: 'Kramers', city: 'Washington', state: 'DC', neighborhood: 'Dupont Circle', skip: 'only past club events listed (2025); nothing current',
  },
  // ---------------- New York metro ----------------
  {
    venue: 'Book Club Bar', city: 'New York', state: 'NY', neighborhood: 'East Village',
    platform: 'bookmanager', home: 'https://www.bookclubbar.com/',
    pages: [
      { url: 'https://www.bookclubbar.com/events/fiction-book-club', clubs: [{ name: 'Book Club²', match: 'Book Club2', genres: ['literary'], vibe: 'General fiction discussion over cocktails at the bar; capped', cadence: 'Monthly' }] },
      { url: 'https://www.bookclubbar.com/events/indie-press-book-club', clubs: [{ name: 'Indie Press Book Club', genres: ['literary'], vibe: 'Recent small-press fiction over Saturday brunch', cadence: 'Monthly, Saturday' }] },
      { url: 'https://www.bookclubbar.com/events/philosophy-book-club', clubs: [{ name: 'How to Be Book Club', vibe: 'Philosophical fiction plus a companion philosophy text', cadence: 'Monthly, Saturday' }] },
      { url: 'https://www.bookclubbar.com/events/poetry-book-club', clubs: [{ name: 'Poetry Today', genres: ['poetry'], vibe: 'One contemporary poetry collection a month, over brunch', cadence: 'Monthly' }] },
      { url: 'https://www.bookclubbar.com/events/rereads-book-club', clubs: [{ name: 'ReReads Book Club', vibe: "Revisiting old favorites, often ahead of an author's new book" }] },
      { url: 'https://www.bookclubbar.com/events/romance-book-club', clubs: [{ name: 'HEA Romance Book Club', genres: ['romance'], vibe: 'All things romance over cocktails; capped', cadence: 'Monthly' }] },
      { url: 'https://www.bookclubbar.com/events/sapphic-lit-book-club', clubs: [{ name: 'Sapphic Lit Book Club', genres: ['lgbtq'], vibe: 'Any genre with a sapphic main character or story' }] },
    ],
  },
  {
    venue: 'Community Bookstore', city: 'Brooklyn', state: 'NY', neighborhood: 'Park Slope',
    platform: 'bookmanager', home: 'https://www.communitybookstore.net/',
    pages: [{
      url: 'https://www.communitybookstore.net/events', source: 'events',
      clubs: [
        { name: 'Community Bookstore Book Club', genres: ['literary'] },
        { name: 'Small Press Book Club', genres: ['literary'], vibe: 'Small-press picks' },
      ],
    }],
  },
  // ---------------- Dallas-Fort Worth ----------------
  {
    venue: 'Deep Vellum Books', city: 'Dallas', state: 'TX', neighborhood: 'Deep Ellum', home: 'https://deepvellum.com/',
    pages: [{
      url: 'https://deepvellum.com/bookclubs',
      clubs: [
        { name: 'Homer Out Loud', genres: ['classics', 'poetry'], vibe: 'Reading an ancient epic out loud together', cadence: 'Weekly, Monday' },
        { name: 'Backlist Book Club', genres: ['literary'], vibe: "Works through the publisher's translated-literature backlist", cadence: 'Monthly, last Thursday' },
        { name: 'Underdogs in Space', genres: ['sci-fi', 'fantasy'], vibe: 'Underread SFF classics by underrepresented authors', cadence: m('1st', 'Wednesday') },
        { name: 'Weird Girl Lit', genres: ['literary'], vibe: 'Novels about strange women making bad decisions', cadence: 'Monthly, last Sunday' },
      ],
    }],
  },
  // ---------------- Austin ----------------
  {
    venue: 'Alienated Majesty Books', city: 'Austin', state: 'TX', neighborhood: null,
    platform: 'bookmanager', home: 'https://www.alienatedmajestybooks.com/',
    pages: [{
      url: 'https://www.alienatedmajestybooks.com/book-clubs',
      clubs: [
        { name: 'NYRB Book Club', genres: ['classics'], vibe: 'NYRB Classics only', cadence: 'Monthly' },
        { name: 'Subculture Lit', genres: ['literary'], vibe: 'Small presses and experimental, transgressive writing', cadence: 'Monthly' },
        { name: 'A Season Of', vibe: 'One author, title or small press explored for a season', cadence: 'Monthly' },
        { name: 'Voyage Out', genres: ['classics'], vibe: "One country's literature at a time", cadence: 'Monthly' },
        { name: 'Apricot Trees Exist', genres: ['poetry'], vibe: 'Reading poems for generative inspiration', cadence: 'Monthly' },
        { name: 'Tiny Words', vibe: 'Short reads under 250 pages', cadence: 'Monthly' },
        { name: 'Art Sex Magic', genres: ['nonfiction'], vibe: 'Nonfiction book club', cadence: 'Monthly' },
      ],
    }],
  },
  // ---------------- Baltimore ----------------
  {
    venue: 'Greedy Reads', city: 'Baltimore', state: 'MD', neighborhood: 'Remington',
    platform: 'bookmanager', home: 'https://www.greedyreads.com/',
    pages: [{
      url: 'https://www.greedyreads.com/events-book-clubs/book-clubs',
      clubs: [
        { name: 'General Book Club', genres: ['literary'], vibe: 'Store-run general club; sign up to say you are coming', cadence: 'Monthly, last Wednesday' },
        { name: 'Queer Book Club', genres: ['lgbtq'], vibe: 'Meets off-site at a local yarn shop', cadence: m('2nd', 'Thursday') },
        { name: 'Romance Book Club', genres: ['romance'], cadence: m('3rd', 'Sunday') },
        { name: 'Black Folx Book Club', vibe: 'Black women and Black queer readers reading Black women and queer authors', cadence: m('2nd', 'Wednesday') },
        { name: 'Expand-the-Canon Book Club', genres: ['classics'], vibe: 'Classics often left off standard reading lists' },
        { name: 'Climate Change Book Club', vibe: 'Fiction, nonfiction and SFF on how climate change hits people and places' },
      ],
    }],
  },
  // ---------------- Pittsburgh ----------------
  {
    venue: 'Riverstone Books', city: 'Pittsburgh', state: 'PA', neighborhood: null, home: 'https://www.riverstonebookstore.com/',
    pages: [{
      url: 'https://www.riverstonebookstore.com/',
      clubs: [
        { name: 'Squirrel Hill Book Club', neighborhood: 'Squirrel Hill' },
        { name: 'Read the Rainbow Book Club', genres: ['lgbtq'], neighborhood: 'McCandless' },
        { name: 'Riverstone Romantics Book Club', genres: ['romance'] },
        { name: 'McCandless Book Club', neighborhood: 'McCandless' },
      ],
    }],
  },
  // ---------------- Miami / South Florida ----------------
  {
    venue: 'Murder on the Beach', city: 'Delray Beach', state: 'FL', neighborhood: null, home: 'https://murderonthebeach.com/',
    pages: [{
      url: 'https://murderonthebeach.com/our-book-clubs/',
      clubs: [{ name: 'The Sunday Sleuths', genres: ['mystery-thriller'], vibe: 'Mysteries of all kinds, picked by group vote', cadence: m('3rd', 'Sunday') }],
    }],
  },
  // ---------------- Tampa Bay ----------------
  // ---------------- SF Bay Area ----------------
  {
    venue: "Kepler's Books", city: 'Menlo Park', state: 'CA', neighborhood: null, home: 'https://www.keplers.org/',
    pages: [{
      url: 'https://www.keplers.org/book-clubs',
      clubs: [
        { name: 'Non-Fiction Book Club', genres: ['nonfiction'], cadence: 'Monthly' },
        { name: 'Deep Cuts Book Club', vibe: 'Themed runs of novels, e.g. coming-of-age' },
      ],
    }],
  },
  // ---------------- Seattle metro ----------------
  {
    venue: 'Elliott Bay Book Company', city: 'Seattle', state: 'WA', neighborhood: 'Capitol Hill',
    platform: 'bookmanager', home: 'https://www.elliottbaybook.com/',
    pages: [{
      url: 'https://www.elliottbaybook.com/events', source: 'events',
      clubs: [
        { name: 'Speculations Book Group', genres: ['sci-fi', 'fantasy'], vibe: 'Science fiction and fantasy group', cadence: m('3rd', 'Wednesday') },
        { name: 'Global Issues Book Group', genres: ['nonfiction'], cadence: m('2nd', 'Wednesday') },
      ],
    }],
  },
  {
    venue: 'Eagle Harbor Book Co.', city: 'Bainbridge Island', state: 'WA', neighborhood: null,
    platform: 'bookmanager', home: 'https://www.eagleharborbooks.com/',
    pages: [{
      url: 'https://www.eagleharborbooks.com/events/book-groups',
      clubs: [{ name: 'Eagle Harbor Readers Circle', genres: ['literary', 'nonfiction'], vibe: 'Store-sponsored eclectic group running since 1992', cadence: m('2nd', 'Tuesday'), format: 'online' }],
    }],
  },
  // ---------------- Minneapolis-St. Paul ----------------
  {
    venue: 'SubText Bookstore', city: 'St. Paul', state: 'MN', neighborhood: 'Downtown',
    platform: 'bookmanager', home: 'https://www.subtextbooks.com/',
    pages: [{ url: 'https://www.subtextbooks.com/events', source: 'events', clubs: [{ name: 'Subtext Book Club' }] }],
  },
  {
    venue: 'Black Garnet Books', city: 'St. Paul', state: 'MN', neighborhood: null,
    platform: 'bookmanager', home: 'https://www.blackgarnetbooks.com/',
    pages: [{
      url: 'https://www.blackgarnetbooks.com/events/book-club',
      clubs: [
        { name: 'Garnet Club: Fantasy Book Pick', match: 'Fantasy Book Pick', genres: ['fantasy'], vibe: 'BIPOC authors; quarterly fantasy pick', cadence: 'Quarterly, 2nd Thursday' },
        { name: 'Garnet Club: Graphic Novel Book Pick', match: 'Graphic Novel Book Pick', genres: ['graphic-novels'], vibe: 'BIPOC authors; quarterly graphic novel pick', cadence: 'Quarterly, 2nd Thursday' },
        { name: 'Garnet Club: Abolition Book Pick', match: 'Abolition Book Pick', genres: ['nonfiction'], vibe: 'BIPOC authors; quarterly abolition reading', cadence: 'Quarterly, 2nd Thursday' },
      ],
    }],
  },
  // ---------------- Salt Lake City ----------------
  {
    venue: "The King's English Bookshop", city: 'Salt Lake City', state: 'UT', neighborhood: '15th & 15th',
    platform: 'bookmanager', home: 'https://www.kingsenglish.com/',
    pages: [{
      url: 'https://www.kingsenglish.com/community/book-groups',
      clubs: [
        { name: 'Armchair Travel Mystery', genres: ['mystery-thriller'], vibe: 'Mysteries set around the world; open to the public, small fee', cadence: m('3rd', 'Wednesday') },
        { name: 'Booked', genres: ['literary'], vibe: 'Award-winning literature and difficult topics in a small group' },
        { name: 'Books Take Flight', vibe: 'Book discussion paired with a wine flight', cadence: 'Monthly' },
        { name: 'The Forbidden Bookshelf', vibe: 'Banned and challenged books' },
        { name: 'The Gloss Book Club', vibe: "Local meetup of a global women's book club" },
        { name: 'Overbooked Literary Ladies', vibe: 'Roughly millennial women; books under 500 pages' },
        { name: 'Read Well, Lead Well', genres: ['nonfiction'], vibe: 'Leadership and business-culture reads' },
        { name: 'Reel Readers: From Page to Screen', vibe: 'Read the book, watch the adaptation; adults only', cadence: 'Monthly' },
        { name: 'Second Monday', vibe: 'Tackles difficult issues', cadence: m('2nd', 'Monday') },
        { name: 'SLC Lesbians', genres: ['lgbtq'], vibe: 'Trans, non-binary and bi-inclusive group', cadence: m('4th', 'Wednesday') },
        { name: 'X-Newman Book Group', vibe: 'Open to the public; new members welcome', cadence: 'Monthly' },
      ],
    }],
  },
  // ---------------- Charlotte ----------------
  {
    venue: 'Main Street Books', city: 'Davidson', state: 'NC', neighborhood: null,
    platform: 'bookmanager', home: 'https://www.mainstreetbooksdavidson.com/',
    pages: [{
      url: 'https://www.mainstreetbooksdavidson.com/book-clubs/about-book-clubs',
      clubs: [
        { name: 'The Lit League Book Club', genres: ['literary'], vibe: 'General adult fiction, buzzy and under-the-radar' },
        { name: 'The Main Squeeze Romance Book Club', genres: ['romance'], vibe: 'Romance with diverse characters' },
        { name: 'The Well Read Black Girl Book Club', vibe: 'Local chapter of Well-Read Black Girl', cadence: 'Monthly' },
      ],
    }],
  },
  // ---------------- additions: NYC metro, Chicago, Boston, Las Vegas, Pittsburgh ----------------
  {
    venue: 'The Astoria Bookshop', city: 'Astoria', state: 'NY', neighborhood: 'Astoria',
    platform: 'bookmanager', home: 'https://www.astoriabookshop.com/',
    pages: [{
      url: 'https://www.astoriabookshop.com/book-clubs/book-clubs',
      clubs: [
        { name: 'Hidden Gems Book Club', vibe: 'Monthly in-store meetup around an overlooked book', cadence: 'Monthly' },
        { name: 'The Astoria Book Club', venue: 'Omonia Cafe', vibe: 'Neighborhood club listed by the Astoria Bookshop; RSVP via Instagram' },
        { name: 'Astoria Dads Book Club', venue: null, vibe: 'Neighborhood dads club listed by the Astoria Bookshop' },
        { name: 'The Astoria Feminist Book Group', venue: null, genres: ['nonfiction'], vibe: "Intersectional look at women's rights worldwide; since 2017" },
        { name: 'Astoria Gay Book Club', venue: null, genres: ['lgbtq'], vibe: 'Community for queer and LGBTQ+ men' },
        { name: 'Astoria Horror Book Club', venue: null, genres: ['horror'], vibe: 'Spooky-story fans in the neighborhood' },
        { name: 'Astoria Lesbian Book Club', venue: null, genres: ['lgbtq'], vibe: 'Lesbian and sapphic literature; queer-inclusive', cadence: 'Monthly' },
        { name: 'Astoria Moms Book Club', venue: null, vibe: 'Neighborhood moms club listed by the Astoria Bookshop' },
        { name: 'Astoria Philosophy Book Club', venue: null, vibe: 'Reading philosophy together; no background needed' },
        { name: 'The Rolling Library Queer Book Club', venue: null, genres: ['lgbtq'], vibe: 'LGBTQIA+ fiction of all genres, meets outdoors in Queens', cadence: 'Monthly' },
        { name: 'Turnt Pages Book Club', venue: 'The Bier & Cheese Collective', neighborhood: 'Ditmars', vibe: 'No registration; buy something from the host venue', cadence: m('1st', 'Monday') },
      ],
    }],
  },
  {
    venue: 'Watchung Booksellers', city: 'Montclair', state: 'NJ', neighborhood: null,
    platform: 'bookmanager', home: 'https://www.watchungbooksellers.com/',
    pages: [{
      url: 'https://www.watchungbooksellers.com/events/book-clubs',
      clubs: [
        { name: 'NYT Best 100 Books of the 21st Century Book Club', genres: ['literary'], vibe: "Reading through the NYT list of the century's 100 best books", cadence: 'Monthly, last Monday' },
        { name: 'Thought Daughter Book Club', vibe: 'Undiscovered books under 300 pages', cadence: 'Monthly, last Thursday' },
        { name: 'NYT 50 Best Thriller of 21st Century Book Club', genres: ['mystery-thriller'], vibe: 'Reading through the NYT best thrillers list', cadence: m('3rd', 'Monday') },
        { name: 'Just the T Book Club', genres: ['lgbtq'], vibe: 'Fiction and nonfiction by trans authors', cadence: m('3rd', 'Tuesday') },
        { name: 'Cookbook Book Club', vibe: 'Discussion and tasting of dishes from a chosen cookbook', cadence: m('3rd', 'Tuesday') },
        { name: 'Watchung Booksellers Podcast Book Club', vibe: "Books recommended by guests on the store's podcast", format: 'hybrid' },
        { name: 'Climate Change Book Club', genres: ['nonfiction'], vibe: 'Community-run; books on the climate crisis', cadence: m('2nd', 'Monday') },
        { name: 'Nasty Women Book Club', vibe: 'Books by women authors; founded 2017' },
        { name: 'Great Writers Book Club', genres: ['classics'], vibe: 'Community-run club reading great writers', cadence: m('1st', 'Friday') },
      ],
    }],
  },
  {
    venue: 'City Lit Books', city: 'Chicago', state: 'IL', neighborhood: 'Logan Square',
    platform: 'bookmanager', home: 'https://www.citylitbooks.com/',
    pages: [
      { url: 'https://www.citylitbooks.com/book-clubs/pretty-in-paperback', clubs: [{ name: 'Pretty in Paperback' }] },
      { url: 'https://www.citylitbooks.com/book-clubs/on-earth-we-re-briefly-gay', clubs: [{ name: "On Earth We're Briefly Gay", genres: ['lgbtq'] }] },
      { url: 'https://www.citylitbooks.com/book-clubs/blood-guts', clubs: [{ name: 'Blood & Guts', genres: ['horror'] }] },
      { url: 'https://www.citylitbooks.com/book-clubs/club-150', clubs: [{ name: 'Club 150' }] },
      { url: 'https://www.citylitbooks.com/book-clubs/cookbook-book-club', clubs: [{ name: 'Cookbook Book Club' }] },
      { url: 'https://www.citylitbooks.com/book-clubs/weird-x-wonderful', clubs: [{ name: 'Weird X Wonderful' }] },
    ],
  },
  {
    venue: 'The Silver Unicorn Bookstore', city: 'Acton', state: 'MA', neighborhood: null,
    platform: 'bookmanager', home: 'https://www.silverunicornbooks.com/',
    pages: [{
      url: 'https://www.silverunicornbooks.com/events/book-clubs',
      clubs: [
        { name: 'Friday Fiction Book Club', genres: ['literary'], vibe: 'Morning novel discussion, all welcome', cadence: 'Monthly, Friday' },
        { name: 'Romance Book Club', genres: ['romance'], cadence: m('3rd', 'Monday') },
        { name: 'Resistance Book Club', genres: ['nonfiction', 'historical-fiction'], vibe: 'American history of injustice and the fight for democracy' },
        { name: 'Walking Book Club', vibe: 'Bring an audiobook and walking shoes; talk while walking', cadence: 'Monthly, last Saturday' },
        { name: 'Boxborough Birders Book Club', genres: ['nonfiction'], vibe: 'For readers interested in birds and birding', cadence: 'Monthly, last Tuesday' },
      ],
    }],
  },
  {
    venue: "The Writer's Block", city: 'Las Vegas', state: 'NV', neighborhood: 'Arts District',
    platform: 'bookmanager', home: 'https://www.thewritersblock.org/',
    pages: [{
      url: 'https://www.thewritersblock.org/events', source: 'events',
      clubs: [
        { name: 'Poems & Pie Book Club', match: 'POEMS & PIE BOOK CLUB', genres: ['poetry'] },
        { name: 'Big Book Club', match: 'BIG BOOK CLUB' },
        { name: 'Reading Women Book Club', match: 'READING WOMEN BOOK CLUB' },
        { name: 'Drama Book Club', match: 'DRAMA BOOK CLUB', vibe: 'Plays and drama' },
        { name: 'Queer as B**k Book Club', match: 'QUEER AS B**K BOOK CLUB', genres: ['lgbtq'] },
        { name: 'Book Lovers Book Club', match: 'BOOK LOVERS BOOK CLUB' },
        { name: 'Bourbon Book Club', match: 'BOURBON BOOK CLUB' },
        { name: 'Lewd Lit Book Club', match: 'LEWD LIT BOOK CLUB', genres: ['romance'] },
      ],
    }],
  },
  {
    venue: 'White Whale Bookstore', city: 'Pittsburgh', state: 'PA', neighborhood: 'Bloomfield',
    platform: 'bookmanager', home: 'https://www.whitewhalebookstore.com/',
    pages: [{
      url: 'https://www.whitewhalebookstore.com/events/book-clubs',
      clubs: [{ name: 'Pod Picks Book Club', vibe: 'A bookseller leads a staff-pick discussion', cadence: 'Monthly, last Thursday' }],
    }],
  },
];
