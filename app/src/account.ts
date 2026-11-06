export interface Session {access_token:string;refresh_token:string;expires_in:number;user:{id:string;email?:string}}
export type Transport=(path:string,body?:any,token?:string,method?:string)=>Promise<any>;
// Sessions intentionally live in memory. Tokens never enter Preferences, localStorage,
// URLs, logs, analytics, or the public directory cache.
export class AccountClient {
 private session:Session|null=null;
 private expires=0;
 private generation=0;
 private refreshing:Promise<void>|null=null;
 private transport:Transport;
 private now:()=>number;
 constructor(transport:Transport,now=()=>Date.now()){this.transport=transport;this.now=now;}
 get user(){return this.session?.user??null;}
 private accept(value:any){const s=value?.session;if(!s?.access_token||!s?.refresh_token||!s?.user?.id||!Number.isFinite(s.expires_in))throw Error('Your code could not be verified. Request a fresh code and try again.');this.session=s;this.expires=this.now()+s.expires_in*1000;}
 async start(email:string){await this.transport('/functions/v1/bookish-auth',{action:'start',email});}
 async password(email:string,password:string){this.accept(await this.transport('/functions/v1/bookish-auth',{action:'password',email,password}));}
 async verify(email:string,token:string){this.accept(await this.transport('/functions/v1/bookish-auth',{action:'verify',email,token}));}
 private async access(){
  if(!this.session)throw Error('Sign in to continue.');
  if(this.now()>=this.expires-500){
   this.refreshing??=(async()=>{const generation=this.generation;try{const result=await this.transport('/functions/v1/bookish-auth',{action:'refresh',refresh_token:this.session!.refresh_token});if(generation!==this.generation)throw Error('Session closed');this.accept(result);}catch{this.session=null;throw Error('Your session ended. Sign in again to continue.');}finally{this.refreshing=null;}})();
   await this.refreshing;
  }
  return this.session!.access_token;
 }
 private async authenticated(path:string,body?:unknown,method='POST'){try{return await this.transport(path,body,await this.access(),method);}catch(error){if((error as {status?:number}).status===401){this.clear();throw Error('Your session ended. Sign in again to continue.');}throw error;}}
 async rpc(name:string,args:Record<string,unknown>={}){return this.authenticated(`/rest/v1/rpc/${name}`,args);}
 async calendar(meeting:string):Promise<string>{if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(meeting))throw Error('Choose a valid meeting.');const content=await this.authenticated(`/functions/v1/bookish-meeting-calendar?meeting=${encodeURIComponent(meeting)}`,undefined,'GET');if(typeof content!=='string'||!content.startsWith('BEGIN:VCALENDAR'))throw Error('The calendar file is unavailable. Try again.');return content;}
 async read(table:string,query:string){return this.authenticated(`/rest/v1/${table}?${query}`,undefined,'GET');}
 async update(table:string,query:string,value:Record<string,unknown>){return this.authenticated(`/rest/v1/${table}?${query}`,value,'PATCH');}
 async edge(name:string,body:Record<string,unknown>={}){return this.authenticated(`/functions/v1/${name}`,body);}
 async signOut(){this.generation++;const token=this.session?.access_token;this.session=null;this.expires=0;if(token)try{await this.transport('/functions/v1/bookish-auth',{action:'logout'},token);}catch{/* Local sign-out remains available offline. */}}
 clear(){this.generation++;this.session=null;this.expires=0;}
}
