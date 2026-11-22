/* USD-based FX rates from Frankfurter (free, no key). Cached 6h in localStorage.
   Returns { rates: {EUR: 0.92, ...} meaning 1 USD = x CCY, date } or null. */
'use strict';

async function loadRates(force = false) {
  const cached = Store.get('rates', null);
  if (!force && cached && Date.now() - cached.fetched < 6 * 3600e3) return cached;
  const urls = ['https://api.frankfurter.dev/v1/latest?base=USD', 'https://api.frankfurter.app/latest?from=USD'];
  for (const u of urls) {
    try {
      const res = await fetch(u, { cache: 'no-store' });
      if (!res.ok) continue;
      const j = await res.json();
      const data = { rates: { ...j.rates, USD: 1 }, date: j.date, fetched: Date.now() };
      Store.set('rates', data);
      return data;
    } catch {}
  }
  return cached || null;
}

// How many USD is 1 unit of ccy worth
function toUsd(ccy, rates) {
  if (ccy === 'USD') return 1;
  const r = rates && rates.rates && rates.rates[ccy];
  return r ? 1 / r : NaN;
}
