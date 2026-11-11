// GitHub Pages serves this resource-only fallback through the site's 404 page.
// A message URL grants no access. The destination signs in and refetches data.
(() => {
 const base=document.documentElement.dataset.base||'';
 if(location.search||location.hash||!location.pathname.startsWith(base+'/'))return;
 const path=location.pathname.slice(base.length);
 const match=/^\/imessage\/v2\/(take|vote|meeting)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(path);
 if(match)location.replace(`${base}/app/#message=${match[1].toLowerCase()}/${match[2].toLowerCase()}`);
})();
