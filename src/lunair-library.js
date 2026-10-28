// This runs before other page resources. Credentials never remain in the address bar.
(() => {
  let magicToken = new URLSearchParams(location.hash.slice(1)).get('token');
  if (location.hash || location.search) history.replaceState(null, '', location.pathname);

  function start() {
    const find = id => document.getElementById(id);
    const form = find('library-form');
    const email = find('library-email');
    const submit = find('library-submit');
    const status = find('library-status');
    const owned = find('library-owned');
    const packsList = find('library-packs');
    const refresh = find('library-refresh');
    const sessionKey = 'lunair-library-session';
    const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
    let api;
    let session = null;
    let packs = [];
    let generation = 0;
    let expiryTimer;
    let downloadTimer;
    let busy = false;

    function message(text, error = false) {
      status.textContent = text;
      status.dataset.error = String(error);
    }
    function storedSession(value) {
      try {
        if (value) sessionStorage.setItem(sessionKey, JSON.stringify(value));
        else sessionStorage.removeItem(sessionKey);
      } catch { /* The current tab still works when browser storage is unavailable. */ }
    }
    function validSession(value) {
      return value && tokenPattern.test(value.accessToken) && typeof value.expiresAt === 'string' && Date.parse(value.expiresAt) > Date.now();
    }
    function clearSession(text = '') {
      generation += 1;
      session = null;
      packs = [];
      busy = false;
      clearTimeout(expiryTimer);
      clearTimeout(downloadTimer);
      storedSession(null);
      packsList.replaceChildren();
      owned.hidden = true;
      form.hidden = false;
      refresh.disabled = false;
      submit.disabled = !api;
      email.disabled = !api;
      message(text);
    }
    function saveSession(value) {
      session = { accessToken: value.accessToken, expiresAt: value.expiresAt };
      storedSession(session);
      clearTimeout(expiryTimer);
      expiryTimer = setTimeout(() => clearSession('Your library session has expired. Email yourself a new link to keep browsing.'), Math.min(Date.parse(session.expiresAt) - Date.now(), 2147483647));
    }
    function safeDownload(value) {
      try {
        const url = new URL(value);
        return url.origin === api.origin && !url.username && !url.password && !url.hash &&
          /^\/storage\/v1\/object\/sign\/lunair-packs-test\/packs\/[a-z0-9-]+\.zip$/.test(url.pathname) && url.searchParams.get('token') ? url.href : null;
      } catch { return null; }
    }
    function renderPacks() {
      clearTimeout(downloadTimer);
      packsList.replaceChildren();
      let nextExpiry = Infinity;
      for (const pack of packs) {
        const item = document.createElement('li');
        item.className = 'library-pack';
        const title = document.createElement('h3');
        title.textContent = pack.title;
        item.append(title);
        const detail = document.createElement('p');
        const expires = Date.parse(pack.expiresAt);
        const destination = safeDownload(pack.downloadUrl);
        if (destination && expires > Date.now()) {
          detail.textContent = `Download link expires ${new Date(expires).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`;
          const link = document.createElement('a');
          link.className = 'buy';
          link.textContent = 'Download ZIP';
          link.setAttribute('aria-label', `Download ${pack.title} ZIP`);
          link.href = destination;
          link.rel = 'noreferrer noopener';
          link.referrerPolicy = 'no-referrer';
          item.append(detail, link);
          nextExpiry = Math.min(nextExpiry, expires);
        } else {
          detail.textContent = expires <= Date.now() ? 'This download link has expired. Select Refresh downloads for a fresh link.' : 'This download link is unavailable. Select Refresh downloads to try again.';
          item.append(detail);
        }
        packsList.append(item);
      }
      find('library-empty').hidden = packs.length !== 0;
      if (Number.isFinite(nextExpiry)) downloadTimer = setTimeout(renderPacks, Math.min(Math.max(1, nextExpiry - Date.now()), 2147483647));
    }
    function showLibrary(data, focus) {
      if (!Array.isArray(data.packs) || typeof data.grimoire !== 'boolean' || data.packs.some(pack => !pack || typeof pack.id !== 'string' || typeof pack.title !== 'string' || typeof pack.downloadUrl !== 'string' || typeof pack.expiresAt !== 'string')) throw new Error('Invalid library response');
      packs = data.packs;
      renderPacks();
      form.hidden = true;
      owned.hidden = false;
      find('library-grimoire').hidden = !data.grimoire;
      message('');
      if (focus) find('library-owned-heading').focus();
    }
    async function request(body, accessToken) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(api.href, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
          body: JSON.stringify(body),
          credentials: 'omit',
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
          redirect: 'error',
          signal: controller.signal,
        });
        if (!response.ok) {
          const error = new Error('Library request failed');
          error.status = response.status;
          throw error;
        }
        return await response.json();
      } finally { clearTimeout(timeout); }
    }
    function errorMessage(error, redeem = false) {
      if (error.status === 401) return redeem ? 'This library link has expired or has already been used. Email yourself a new link below.' : 'Your library session has expired. Email yourself a new link below.';
      if (error.status === 429) return 'Too many requests just now. Wait a few minutes, then try again.';
      return 'We couldn’t open your library right now. Check your connection, then try again.';
    }
    async function loadLibrary(token) {
      if (busy) return;
      if (!token && !validSession(session)) {
        clearSession('Your library session has expired. Email yourself a new link below.');
        return;
      }
      busy = true;
      const requestGeneration = generation;
      const focusLibrary = Boolean(token);
      let redeeming = Boolean(token);
      refresh.disabled = true;
      submit.disabled = true;
      email.disabled = true;
      message(token ? 'Opening your library…' : 'Refreshing your downloads…');
      try {
        if (token) {
          const access = await request({ action: 'redeem', token });
          if (requestGeneration !== generation) return;
          if (!validSession(access)) throw new Error('Invalid session');
          saveSession(access);
          token = null;
          redeeming = false;
        }
        // Authentication survives temporary Storage or catalog failures.
        form.hidden = true;
        owned.hidden = false;
        if (!packs.length) {
          find('library-empty').hidden = true;
          find('library-grimoire').hidden = true;
        }
        const data = await request({ action: 'list' }, session.accessToken);
        if (requestGeneration !== generation) return;
        showLibrary(data, focusLibrary);
      } catch (error) {
        if (requestGeneration !== generation) return;
        if (!session || error.status === 401) clearSession();
        message(session ? `${errorMessage(error)} Select Refresh downloads to try again.` : errorMessage(error, redeeming), true);
      } finally {
        token = null;
        if (requestGeneration === generation) {
          busy = false;
          refresh.disabled = false;
          submit.disabled = !api;
          email.disabled = !api;
        }
      }
    }

    const configured = document.documentElement.dataset.libraryApi;
    try {
      if (!configured) throw new Error('Not configured');
      const endpoint = new URL(configured);
      if (endpoint.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(endpoint.hostname) || endpoint.port || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/functions/v1/lunair-library') throw new Error('Invalid endpoint');
      api = endpoint;
    } catch {
      magicToken = null;
      clearSession('The library is not open yet. Please check back soon, or use the download link in your purchase email.');
      return;
    }

    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (busy) return;
      email.value = email.value.trim();
      email.removeAttribute('aria-invalid');
      if (!email.checkValidity()) {
        email.setAttribute('aria-invalid', 'true');
        message('Enter the email address you used at checkout.', true);
        email.focus();
        return;
      }
      busy = true;
      submit.disabled = true;
      submit.textContent = 'Sending your link…';
      message('Sending your library link…');
      try {
        await request({ action: 'request_link', email: email.value });
        message('If this email owns a Lunair pack, a library link is on its way. Check your inbox and spam folder.');
      } catch (error) { message(errorMessage(error), true); }
      finally {
        busy = false;
        submit.disabled = false;
        submit.textContent = 'Email my library link';
      }
    });
    refresh.addEventListener('click', () => loadLibrary());
    find('library-sign-out').addEventListener('click', () => {
      clearSession('You’re signed out. Your wallpapers will be here when you return.');
      email.value = '';
      email.focus();
    });
    email.disabled = false;
    submit.disabled = false;
    message('');
    if (magicToken !== null) {
      const token = magicToken;
      magicToken = null;
      clearSession();
      if (tokenPattern.test(token)) loadLibrary(token);
      else message('This library link is invalid. Email yourself a new link below.', true);
      return;
    }
    let saved;
    try { saved = JSON.parse(sessionStorage.getItem(sessionKey)); } catch { storedSession(null); }
    if (validSession(saved)) {
      saveSession(saved);
      loadLibrary();
    } else if (saved) clearSession('Your library session has expired. Email yourself a new link below.');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
