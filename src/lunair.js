// Only campaign attribution crosses to Fictora, never unrelated query values.
(() => {
  const inbound = new URLSearchParams(location.search);
  const attribution = new URLSearchParams({ utm_source: 'instagram', utm_campaign: 'lunairandmidnight' });
  for (const key of new Set(inbound.keys())) {
    if (/^utm_[a-z0-9_]+$/i.test(key) && inbound.get(key)) attribution.set(key, inbound.get(key));
  }
  document.querySelectorAll('a[data-pass-utm]').forEach(link => {
    const destination = new URL(link.href);
    for (const [key, value] of attribution) destination.searchParams.set(key, value);
    link.href = destination.href;
  });
})();
