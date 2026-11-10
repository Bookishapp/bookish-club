export type AppLink = {kind:'invite';code:string}|{kind:'club';id:string}|{kind:'message';url:string};

// Interpret links as app state. Never navigate the local WebView to a remote URL.
export function appLink(value:string):AppLink|null {
  try {
    const url=new URL(value);
    if(url.protocol!=='https:'||url.hostname!=='meetbookish.com'||url.port||url.username||url.password)return null;
    const hash=decodeURIComponent(url.hash.slice(1));
    if(/^\/app\/?$/.test(url.pathname)){
      const message=/^message=(take|vote|meeting)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(hash);
      if(message)return {kind:'message',url:`bookish://message/${message[1].toLowerCase()}/${message[2]}`};
      const invite=/^invite=([A-Z0-9]{6,12})$/i.exec(hash);
      return invite?{kind:'invite',code:invite[1].toUpperCase()}:null;
    }
    if(url.pathname.startsWith('/book-clubs/')&&/^[a-z0-9_-]{1,200}$/i.test(hash))return {kind:'club',id:hash};
  } catch { /* Ignore malformed and unrelated incoming intents. */ }
  return null;
}
