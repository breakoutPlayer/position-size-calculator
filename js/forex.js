/* Forex / CFD lot sizing. Account currency USD, no fees. */
'use strict';

const $ = (id) => document.getElementById(id);
let rates = Store.get('rates', null);
let mode = Store.get('fxMode', 'price');
let side = Store.get('fxSide', 'long');
let last = null;

const specOf = (s) => {
  const def = INSTRUMENTS.find(x => x.s === s) || INSTRUMENTS[0];
  return { ...def, ...Store.get('spec:' + def.s, {}) };
};

// Quote currency -> USD
function quoteToUsd(inst, entry, override) {
  if (inst.quote === 'USD') return { v: 1, src: 'USD-quoted' };
  if (override > 0) return { v: override, src: 'manual override' };
  if (inst.type === 'fx' && inst.base === 'USD' && entry > 0) return { v: 1 / entry, src: 'from entry price' };
  const v = toUsd(inst.quote, rates);
  return { v, src: Number.isFinite(v) ? `live rate${rates && rates.date ? ' (' + rates.date + ')' : ''}` : 'unavailable' };
}

// Pure calculation
function calcFx(i, inst) {
  const errors = [], warns = [];
  if (!(i.capital > 0)) errors.push('Balance must be above zero.');
  if (!(i.risk > 0)) errors.push('Risk % must be above zero.');
  if (!(i.trades >= 1)) errors.push('Number of trades must be at least 1.');
  if (!(inst.cs > 0) || !(inst.pip > 0) || !(inst.step > 0)) errors.push('Contract size, pip size and lot step must be above zero.');

  let dir, dist, sl = i.sl, tp = i.tp;
  if (i.mode === 'price') {
    if (!(i.entry > 0) || !(i.sl > 0)) errors.push('Enter entry and stop-loss prices.');
    else if (i.entry === i.sl) errors.push('Entry and stop-loss cannot be equal.');
    else {
      dir = i.sl < i.entry ? 'long' : 'short';
      dist = Math.abs(i.entry - i.sl);
      if (tp > 0 && (dir === 'long' ? tp <= i.entry : tp >= i.entry)) { warns.push(`Take-profit is on the wrong side of entry for a ${dir}.`); tp = NaN; }
    }
  } else {
    dir = i.side;
    if (!(i.slPips > 0)) errors.push(`Enter stop-loss in ${inst.unit}.`);
    else {
      dist = i.slPips * inst.pip;
      if (i.entry > 0) {
        const sgn = dir === 'long' ? -1 : 1;
        sl = i.entry + sgn * dist;
        tp = i.tpPips > 0 ? i.entry - sgn * i.tpPips * inst.pip : NaN;
      }
    }
  }
  const q = quoteToUsd(inst, i.entry, i.rate);
  if (!errors.length && !Number.isFinite(q.v))
    errors.push(`Need ${inst.quote}→USD rate: ${inst.type === 'fx' && inst.base === 'USD' ? 'enter the entry price, or ' : ''}set it in Instrument settings (live rates unavailable).`);
  if (errors.length) return { errors, warns };

  const riskUsd = i.capital * i.risk / 100 / i.trades;
  const lossPerLot = dist * inst.cs * q.v;
  const rawLots = riskUsd / lossPerLot;
  const lots = floorToStep(rawLots, inst.step);
  if (lots <= 0) warns.push(`Calculated size ${fmtNum(rawLots, 4)} lots is below the lot step ${inst.step}. Risk is too small for this stop.`);
  const loss = lots * lossPerLot;
  const tpDist = i.mode === 'price' ? (tp > 0 ? Math.abs(tp - i.entry) : NaN) : (i.tpPips > 0 ? i.tpPips * inst.pip : NaN);
  const profit = lots * tpDist * inst.cs * q.v;
  const rr = tpDist / dist;
  return { errors, warns, dir, dist, sl, tp, riskUsd, rawLots, lots, loss, profit, rr, q };
}

/* ---------- UI ---------- */
function fillSymbols() {
  const groups = {};
  INSTRUMENTS.forEach(x => (groups[x.group] = groups[x.group] || []).push(x));
  $('sym').innerHTML = Object.entries(groups).map(([g, list]) =>
    `<optgroup label="${g}">${list.map(x => `<option value="${x.s}">${x.s}${x.label ? ' — ' + x.label : ''}</option>`).join('')}</optgroup>`).join('');
}

function loadSpecFields() {
  const inst = specOf($('sym').value);
  $('cs').value = inst.cs; $('pip').value = inst.pip; $('step').value = inst.step;
  $('qccy').textContent = inst.quote;
  $('rate').value = Store.get('rate:' + inst.quote, '');
  $('rate').disabled = inst.quote === 'USD';
  document.querySelectorAll('.unit').forEach(el => {
    const u = inst.unit; el.textContent = el.closest('dt') ? (u === 'pips' ? 'Pip' : 'Point') : u;
  });
}

function saveSpec() {
  const s = $('sym').value;
  Store.set('spec:' + s, { cs: num('cs'), pip: num('pip'), step: num('step') });
  render();
}

function syncMode() {
  document.querySelectorAll('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.m === mode));
  document.querySelectorAll('#dirSeg button').forEach(b => b.classList.toggle('on', b.dataset.d === side));
  $('dirSeg').hidden = mode === 'price';
  document.querySelectorAll('.pm-price').forEach(el => el.hidden = mode !== 'price');
  document.querySelectorAll('.pm-pips').forEach(el => el.hidden = mode !== 'pips');
  document.querySelectorAll('.pm-pct').forEach(el => el.hidden = mode !== 'pct');
  document.querySelectorAll('.pm-tp').forEach(el => el.hidden = mode === 'pips');
  $('modeHint').textContent = mode === 'pct' ? 'Pick long or short, then enter the stop-loss % from entry.' : mode === 'price'
    ? 'Long or short is detected from where your stop-loss sits.'
    : 'Entry price is optional in this mode.';
}

function render() {
  const inst = specOf($('sym').value);
  const i = { capital: num('capital'), risk: num('risk'), trades: num('trades'),
    entry: num('entry'), sl: num('sl'), tp: num('tp'), slPips: num('slPips'), tpPips: num('tpPips'),
    rate: num('rate'), mode, side };
  if (mode === 'pct') {
    // Derive the SL price from entry and % distance, then size as in price mode.
    const pct = num('slPct');
    i.sl = i.entry > 0 && pct > 0 && pct < 100 ? i.entry * (1 + (side === 'long' ? -1 : 1) * pct / 100) : NaN;
    i.mode = 'price';
    $('modeHint').textContent = Number.isFinite(i.sl)
      ? `Stop-loss price: ${+i.sl.toFixed(priceDp(i.entry) + 2)}`
      : 'Pick long or short, then enter entry price and stop-loss % from entry.';
  }
  const r = calcFx(i, inst);
  last = { i, r, inst };
  $('alerts').innerHTML = r.errors.map(e => `<div class="alert err">${e}</div>`).join('') +
    (r.warns || []).map(w => `<div class="alert warn">⚠ ${w}</div>`).join('');
  const q = quoteToUsd(inst, i.entry, i.rate);
  $('rateInfo').textContent = inst.quote === 'USD' ? 'USD-quoted: no conversion needed.'
    : `1 ${inst.quote} = ${Number.isFinite(q.v) ? fmtNum(q.v, 6) : '?'} USD — ${q.src}`;
  $('rate').placeholder = Number.isFinite(q.v) && !(i.rate > 0) ? 'auto ' + fmtNum(q.v, 6) : 'auto';

  const keys = ['lots', 'loss', 'profit'];
  if (r.errors.length) {
    keys.forEach(k => $(k).textContent = '—');
    ['lotsSub', 'lossSub', 'rr'].forEach(k => $(k).textContent = '');
    $('dir').innerHTML = '';
    return;
  }
  $('dir').innerHTML = `<span class="badge ${r.dir}">${r.dir.toUpperCase()}</span>`;
  $('lots').textContent = fmtNum(r.lots, 2);
  $('lotsSub').textContent = `SL ${fmtNum(r.dist / inst.pip, 1)} ${inst.unit}`;
  $('loss').textContent = '-' + fmtUsd(r.loss);
  $('lossSub').textContent = `${fmtNum(r.loss / i.capital * 100, 2)}% of balance`;
  $('profit').textContent = Number.isFinite(r.profit) ? '+' + fmtUsd(r.profit) : '—';
  $('rr').textContent = Number.isFinite(r.rr) ? `R:R 1 : ${fmtNum(r.rr, 2)}` : 'add a TP';
}

$('copyLots').addEventListener('click', () => {
  if (!last || last.r.errors.length || !(last.r.lots > 0)) return toast('Nothing to copy yet');
  copyText(String(last.r.lots));
});

fillSymbols();
persistInputs('forex');
if (!INSTRUMENTS.some(x => x.s === $('sym').value)) $('sym').value = 'EURUSD';
loadSpecFields(); syncMode();

['capital', 'risk', 'trades', 'entry', 'sl', 'tp', 'slPct', 'slPips', 'tpPips'].forEach(k => $(k).addEventListener('input', render));
['cs', 'pip', 'step'].forEach(k => $(k).addEventListener('input', saveSpec));
$('rate').addEventListener('input', () => { Store.set('rate:' + specOf($('sym').value).quote, $('rate').value); render(); });
$('sym').addEventListener('change', () => { loadSpecFields(); render(); });
$('resetSpec').addEventListener('click', () => { localStorage.removeItem('psc:spec:' + $('sym').value); loadSpecFields(); render(); toast('Defaults restored'); });
$('refreshRates').addEventListener('click', async () => { rates = await loadRates(true); render(); toast(rates ? 'Rates updated' : 'Rates unavailable'); });
document.querySelectorAll('#modeSeg button').forEach(b => b.addEventListener('click', () => { mode = b.dataset.m; Store.set('fxMode', mode); syncMode(); render(); }));
document.querySelectorAll('#dirSeg button').forEach(b => b.addEventListener('click', () => { side = b.dataset.d; Store.set('fxSide', side); syncMode(); render(); }));

render();
loadRates().then(r => { if (r) { rates = r; render(); } });
initMobileBar('Lot size', 'lots', [['Loss', 'loss'], ['Profit', 'profit']]);
