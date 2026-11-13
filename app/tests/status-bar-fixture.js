// Local simulator fixture for the unverified finder detail regression.
// Loaded only through the existing Debug simulator QA hook.
(() => {
  const club = {id:'status-bar-club',name:'Sunday Reading Circle',city:'Austin',state:'TX',
    lat:30.2672,lng:-97.7431,genres:['Classics'],verified:false,visibility:'open',
    source_name:'Public calendar',source_url:'https://example.test/calendar',
    last_seen:'2026-11-12',format:'In person',cadence:'First Sundays'};
  const response = url => url.includes('bookish-directory') ? {ok:true,clubs:[club]} :
    url.includes('bookish-community') ? {national:[],city:[],state:[],next:[]} : null;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (url, options) => {
    const data = response(String(url));
    return data ? new Response(JSON.stringify(data),{status:200}) : originalFetch(url,options);
  };
  const native = window.Capacitor, original = native?.nativePromise?.bind(native);
  if (original) native.nativePromise = async (plugin, method, options = {}) => {
    if (plugin === 'Preferences') {
      if (method === 'get') return {value:options.key === 'bookish.welcomeSeen' ? 'true' : null};
      return {};
    }
    if (plugin === 'CapacitorHttp') {
      const data = response(options.url || '');
      if (data) return {status:200,data,headers:{},url:options.url};
    }
    return original(plugin,method,options);
  };
  const open = setInterval(() => {
    const button = document.querySelector('.public-calendar-card .club-open');
    if (button) { clearInterval(open); button.click(); }
  },100);
})();
