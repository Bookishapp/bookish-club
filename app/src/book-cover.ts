import { data } from './data.ts';
import { esc } from './domain.ts';
import { appAsset } from './paths.ts';

// Identification thumbnails from the approved art and the existing Open Library
// catalog. Newly added catalog books can still load their Open Library cover.
const bundled:Record<string,string> = {
  "fourth-wing": "Fourth Wing",
  "iron-flame": "Iron Flame",
  "onyx-storm": "Onyx Storm",
  "yellowface": "Yellowface",
  "babel": "Babel",
  "the-god-of-the-woods": "The God of the Woods",
  "the-housemaid": "The Housemaid",
  "funny-story": "Funny Story",
  "book-lovers": "Book Lovers",
  "beach-read": "Beach Read",
  "james": "James",
  "remarkably-bright-creatures": "Remarkably Bright Creatures",
  "lessons-in-chemistry": "Lessons in Chemistry",
  "tomorrow-and-tomorrow-and-tomorrow": "Tomorrow, and Tomorrow, and Tomorrow",
  "the-seven-husbands-of-evelyn-hugo": "The Seven Husbands of Evelyn Hugo",
  "daisy-jones-and-the-six": "Daisy Jones & The Six",
  "a-court-of-thorns-and-roses": "A Court of Thorns and Roses",
  "a-court-of-mist-and-fury": "A Court of Mist and Fury",
  "the-silent-patient": "The Silent Patient",
  "gone-girl": "Gone Girl",
  "where-the-crawdads-sing": "Where the Crawdads Sing",
  "the-thursday-murder-club": "The Thursday Murder Club",
  "the-man-who-died-twice": "The Man Who Died Twice",
  "the-love-hypothesis": "The Love Hypothesis",
  "normal-people": "Normal People",
  "intermezzo": "Intermezzo",
  "pride-and-prejudice": "Pride and Prejudice",
  "jane-eyre": "Jane Eyre",
  "rebecca": "Rebecca",
  "a-little-life": "A Little Life",
  "the-kite-runner": "The Kite Runner",
  "klara-and-the-sun": "Klara and the Sun",
  "never-let-me-go": "Never Let Me Go",
  "the-midnight-library": "The Midnight Library",
  "circe": "Circe",
  "the-song-of-achilles": "The Song of Achilles",
  "the-night-circus": "The Night Circus",
  "the-name-of-the-wind": "The Name of the Wind",
  "tress-of-the-emerald-sea": "Tress of the Emerald Sea",
  "the-priory-of-the-orange-tree": "The Priory of the Orange Tree",
  "the-invisible-life-of-addie-larue": "The Invisible Life of Addie LaRue",
  "project-hail-mary": "Project Hail Mary",
  "big-little-lies": "Big Little Lies",
  "and-then-there-were-none": "And Then There Were None",
  "mexican-gothic": "Mexican Gothic",
  "piranesi": "Piranesi",
  "verity": "Verity",
  "it-ends-with-us": "It Ends with Us",
  "educated": "Educated",
  "demon-copperhead": "Demon Copperhead",
  "small-things-like-these": "Small Things Like These",
  "convenience-store-woman": "Convenience Store Woman",
  "before-the-coffee-gets-cold": "Before the Coffee Gets Cold",
  "the-house-in-the-cerulean-sea": "The House in the Cerulean Sea",
  "legends-and-lattes": "Legends & Lattes",
  "the-women": "The Women",
  "the-nightingale": "The Nightingale",
  "hello-beautiful": "Hello Beautiful",
  "the-covenant-of-water": "The Covenant of Water",
  "crying-in-h-mart": "Crying in H Mart",
  "killers-of-the-flower-moon": "Killers of the Flower Moon",
  "the-wedding-people": "The Wedding People",
  "sandwich": "Sandwich"
};

export const classicBooks:Record<string,{title:string;author:string;color:string}>={
 'pride-and-prejudice':{title:'Pride and Prejudice',author:'Jane Austen',color:'pink'},
 emma:{title:'Emma',author:'Jane Austen',color:'pink'},
 'anne-of-green-gables':{title:'Anne of Green Gables',author:'L. M. Montgomery',color:'orange'},
 'wuthering-heights':{title:'Wuthering Heights',author:'Emily Brontë',color:'lilac'},
 'north-and-south':{title:'North and South',author:'Elizabeth Gaskell',color:'sand'},
 persuasion:{title:'Persuasion',author:'Jane Austen',color:'blue'},
 'jane-eyre':{title:'Jane Eyre',author:'Charlotte Brontë',color:'green'},
 'the-secret-garden':{title:'The Secret Garden',author:'Frances Hodgson Burnett',color:'mint'},
 'little-women':{title:'Little Women',author:'Louisa May Alcott',color:'yellow'},
 'sense-and-sensibility':{title:'Sense and Sensibility',author:'Jane Austen',color:'lilac'}
};
export function bookCover(id?:string,title='',className='',metadata?:{cover_url?:string|null;cover_style?:string}):string {
  const classic=classicBooks[id||'']||Object.values(classicBooks).find(b=>b.title.toLowerCase()===title.toLowerCase());
  if(classic){const key=Object.keys(classicBooks).find(k=>classicBooks[k]===classic)!;return `<span role="img" aria-label="Cover of ${esc(classic.title)}" class="community-book-cover v3-approved-cover ${esc(className)}"><img src="${appAsset('v3/cover-'+key+'.png')}" alt="" loading="lazy"></span>`;}
  const book=data.books.find(b=>b.id===id||!!title&&b.t.toLowerCase()===title.toLowerCase());
  const key=book?.id||(id&&bundled[id]?id:Object.keys(bundled).find(k=>bundled[k].toLowerCase()===title.toLowerCase()));
  const name=book?.t||title||(key?bundled[key]:'Book cover unavailable');
  const remote=metadata?.cover_url&&/^https:\/\/covers\.openlibrary\.org\/b\/id\/[0-9]+-[SML]\.(?:jpg|webp)(?:\?default=false)?$/.test(metadata.cover_url)?metadata.cover_url:null;
  const source=key&&bundled[key]?appAsset(`covers/${key}.jpg`):remote||(book?.c?`https://covers.openlibrary.org/b/id/${book.c}-M.jpg?default=false`:null);
  return `<span class="community-book-cover ${esc(className)} cover-style-${esc(['green','wine','pink','yellow'].includes(metadata?.cover_style||'')?metadata!.cover_style!:'wine')}"><span class="cover-fallback">${esc(name)}</span>${source?`<img src="${source}" alt="Cover of ${esc(name)}" loading="lazy">`:''}</span>`;
}
