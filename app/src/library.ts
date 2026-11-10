// Transport unwraps RPC data and throws on backend errors. No raw rating reads.
export type LibraryRPC = (name:'bookish_library'|'bookish_rate_book'|'bookish_recommendations'|'bookish_rating_action',args:Record<string,unknown>)=>Promise<unknown>;
export type LibraryBook = {id:string;title:string;authors:string[];coverId:number|null;coverUrl:string|null;moods:string[]};
export type BookRating = {hearts:number;take:string;anonymous:boolean};
export type ShelfBook = {
  book:LibraryBook;status:'reading'|'finished'|'dropped';startedAt:string|null;finishedAt:string|null;
  meanHearts:number|null;ratedCount:number;memberCount:number;myRating:BookRating|null;
  favoriteTake:{id:string;body:string;attribution:string}|null;
};
export type ClubLibrary = {club:{id:string;name:string;createdAt:string};books:ShelfBook[]};
export type BookRecommendation = {book:LibraryBook;becauseBook:{id:string;title:string};meanHearts:number;clubs:number};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error();return v as Record<string,unknown>;};
const string=(v:unknown):string=>{if(typeof v!=='string')throw Error();return v;};
const nonempty=(v:unknown):string=>{const s=string(v);if(!s.trim())throw Error();return s;};
const integer=(v:unknown):number=>{if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0)throw Error();return v;};
const hearts=(v:unknown):number=>{if(typeof v!=='number'||!Number.isFinite(v)||v<1||v>5)throw Error();return v;};
const nullableString=(v:unknown):string|null=>v===null?null:string(v);
const strings=(v:unknown):string[]=>{if(!Array.isArray(v))throw Error();return v.map(string);};
const unavailable=(noun='shelf')=>new Error(`Your ${noun} is unavailable. Please try again.`);
function parseBook(value:unknown):LibraryBook{
 const b=object(value);const coverId=b.cover_id===null?null:integer(b.cover_id);
 // Catalog cover URLs are limited to the trusted cover service.
 const coverUrl=nullableString(b.cover_url);if(coverUrl!==null&&!/^https:\/\/covers\.openlibrary\.org\/b\/id\/\d+-[SML]\.jpg$/.test(coverUrl))throw Error();
 return {id:nonempty(b.id),title:nonempty(b.title),authors:strings(b.authors),coverId,coverUrl,moods:strings(b.moods)};
}
function parseRating(value:unknown):BookRating{
 const r=object(value);const n=integer(r.hearts);hearts(n);if(typeof r.anonymous!=='boolean')throw Error();const take=string(r.take);if([...take].length>280)throw Error();return {hearts:n,take,anonymous:r.anonymous};
}
function parseShelfBook(value:unknown):ShelfBook{
 const r=object(value);if(r.status!=='reading'&&r.status!=='finished'&&r.status!=='dropped')throw Error();
 const ratedCount=integer(r.rated_count),memberCount=integer(r.member_count);if(ratedCount>memberCount)throw Error();
 const meanHearts=r.mean_hearts===null?null:hearts(r.mean_hearts);if(meanHearts!==null&&ratedCount<5)throw Error();
 let favoriteTake:ShelfBook['favoriteTake']=null;
 if(r.favorite_take!==null){const t=object(r.favorite_take);if(!uuid(t.id)||r.status==='reading')throw Error();favoriteTake={id:t.id,body:nonempty(t.body),attribution:nonempty(t.attribution)};if([...favoriteTake.body].length>280)throw Error();}
 return {book:parseBook(r.book),status:r.status,startedAt:nullableString(r.started_at),finishedAt:nullableString(r.finished_at),meanHearts,ratedCount,memberCount,myRating:r.my_rating===null?null:parseRating(r.my_rating),favoriteTake};
}
export async function loadLibrary(rpc:LibraryRPC,clubId:string):Promise<ClubLibrary>{
 try{if(!uuid(clubId))throw Error();const data=object(await rpc('bookish_library',{p_club:clubId}));const club=object(data.club);if(club.id!==clubId||!Array.isArray(data.books))throw Error();const books=data.books.map(parseShelfBook);if(new Set(books.map(b=>b.book.id)).size!==books.length)throw Error();return {club:{id:clubId,name:nonempty(club.name),createdAt:nonempty(club.created_at)},books};}catch{throw unavailable();}
}
export async function saveBookRating(rpc:LibraryRPC,clubId:string,bookId:string,rating:BookRating):Promise<ShelfBook>{
 if(!uuid(clubId)||!bookId.trim()||!Number.isInteger(rating.hearts)||rating.hearts<1||rating.hearts>5)throw new Error('Choose 1 to 5 hearts for your rating.');
 if(typeof rating.anonymous!=='boolean')throw new Error('Choose an attribution for your rating.');
 if(typeof rating.take!=='string'||[...rating.take].length>280)throw new Error('A take can be up to 280 characters.');
 try{return parseShelfBook(await rpc('bookish_rate_book',{p_club:clubId,p_book:bookId,p_hearts:rating.hearts,p_take:rating.take.trim(),p_anonymous:rating.anonymous}));}catch{throw unavailable('rating');}
}
export async function loadRecommendations(rpc:LibraryRPC,clubId:string):Promise<BookRecommendation[]>{
 try{if(!uuid(clubId))throw Error();const data=await rpc('bookish_recommendations',{p_club:clubId});if(!Array.isArray(data)||data.length>12)throw Error();return data.map(value=>{const r=object(value),because=object(r.because_book),clubs=integer(r.clubs);if(clubs<3)throw Error();return {book:parseBook(r.book),becauseBook:{id:nonempty(because.id),title:nonempty(because.title)},meanHearts:hearts(r.mean_hearts),clubs};});}catch{throw unavailable('recommendations');}
}
export async function actOnRating(rpc:LibraryRPC,ratingId:string,action:'report'|'hide'|'block',reason:string|null=null):Promise<void>{
 try{if(!uuid(ratingId)||!['report','hide','block'].includes(action))throw Error();await rpc('bookish_rating_action',{p_rating:ratingId,p_action:action,p_reason:reason});}catch{throw unavailable('shelf');}
}
export function ratingLabel(value:number):string{
 return ['Choose your hearts','1 heart, not for me','2 hearts, had its moments','3 hearts, liked it','4 hearts, really liked it','5 hearts, loved it'][value]??'Choose your hearts';
}
