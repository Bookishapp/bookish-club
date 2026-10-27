// Only campaign attribution crosses to Fictora, never unrelated query values.
(() => {
  const inbound = new URLSearchParams(location.search);
  const attribution = new URLSearchParams({ utm_source: 'instagram', utm_campaign: 'lunairandmidnight' });
  const seen = new Set();
  for (const [key, value] of inbound) {
    const normalized = key.toLowerCase();
    if (/^utm_[a-z0-9_]+$/.test(normalized) && value && !seen.has(normalized)) {
      attribution.set(normalized, value);
      seen.add(normalized);
    }
  }
  document.querySelectorAll('a[data-pass-utm]').forEach(link => {
    const destination = new URL(link.href);
    for (const [key, value] of attribution) destination.searchParams.set(key, value);
    link.href = destination.href;
  });
})();
