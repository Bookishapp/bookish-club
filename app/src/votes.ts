import { esc } from './domain.ts';

// Club UI integration point. Never fetch ballot rows or join voter profiles.
// The transport must unwrap the RPC's data and throw on any backend error.
export type VoteRPC = (name:'bookish_vote_tally'|'bookish_my_vote', args:{p_vote:string}) => Promise<unknown>;
export type AnonymousVote = {
  options:{optionId:string;bookId:string;count:number}[];
  total:number;
  myOptionId:string|null;
};
const uuid = (value:unknown):value is string => typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const unavailable = () => new Error('This vote is unavailable. Please try again.');

export async function loadAnonymousVote(rpc:VoteRPC, voteId:string):Promise<AnonymousVote> {
  try {
    if(!uuid(voteId))throw unavailable();
    const [tally,own]=await Promise.all([
      rpc('bookish_vote_tally',{p_vote:voteId}),
      rpc('bookish_my_vote',{p_vote:voteId}),
    ]);
    if(!Array.isArray(tally)||tally.length<2||tally.length>4)throw unavailable();
    const seen=new Set<string>();
    const options=tally.map((row:unknown)=>{
      if(!row||typeof row!=='object')throw unavailable();
      const {option_id,book_id,ballots}=row as Record<string,unknown>;
      if(!uuid(option_id)||seen.has(option_id.toLowerCase())||typeof book_id!=='string'||!book_id.trim())throw unavailable();
      seen.add(option_id.toLowerCase());
      // PostgreSQL bigint may arrive as a JSON number or a decimal string.
      const count=typeof ballots==='string'&&/^(0|[1-9][0-9]*)$/.test(ballots)?Number(ballots):ballots;
      if(typeof count!=='number'||!Number.isSafeInteger(count)||count<0)throw unavailable();
      return {optionId:option_id.toLowerCase(),bookId:book_id,count};
    });
    const total=options.reduce((sum,option)=>sum+option.count,0);
    if(!Number.isSafeInteger(total))throw unavailable();
    if(own!==null&&(!uuid(own)||!options.some(option=>option.optionId===own.toLowerCase()&&option.count>0)))throw unavailable();
    // Construct a new object so unexpected identity fields never enter UI state.
    return {options,total,myOptionId:typeof own==='string'?own.toLowerCase():null};
  } catch {
    // Backend error text can contain row contents. Never render or log it here.
    throw unavailable();
  }
}

export function renderAnonymousVote(vote:AnonymousVote, bookTitles:Readonly<Record<string,string>>):string {
  return `<section class="paper" aria-label="Anonymous vote totals"><h2>Anonymous votes</h2><p>Everyone sees totals, including the vote creator and club admins. Only you can see your choice.</p><p>${vote.total} ${vote.total===1?'vote':'votes'} cast</p><ul>${vote.options.map(option=>{
    const title=Object.hasOwn(bookTitles,option.bookId)?bookTitles[option.bookId]:'Book option';
    return `<li><h3>${esc(title)}</h3><p>${option.count} ${option.count===1?'vote':'votes'}${option.optionId===vote.myOptionId?' · <strong>Your vote</strong>':''}</p></li>`;
  }).join('')}</ul></section>`;
}
