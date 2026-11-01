export type RpcClient = {rpc(name:string,args?:Record<string,unknown>):PromiseLike<{data:unknown;error:unknown}>};
export type DirectoryClub = {id:string;club_id?:string;name:string;city:string;state:string;visibility:string;verified?:boolean;genres?:string[];lat?:number|null;lng?:number|null;[key:string]:unknown};
export type ClubNotice = {kind:string;to:string;name?:string;club:string;note?:string;decision_token?:string;approved?:boolean;host_email?:string};
export type ClubResult = {ok:boolean;error?:string;notice?:ClubNotice;[key:string]:unknown};
