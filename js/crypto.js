/* Crypto futures position sizing. */
'use strict';

// Leverage steps: minimum required, then multiples of 5,
// stopping at maxLev (highest leverage whose rough liquidation is still beyond the stop-loss).
function leverageSteps(minLev, maxLev) {
  const steps = [minLev];
  if (maxLev <= minLev) return steps;
  let next = Math.floor(minLev / 5) * 5 + 5;
  const cap = maxLev;
  for (; next <= cap; next += 5) steps.push(next);
  if (steps[steps.length - 1] < cap) steps.push(cap);
  return steps;
}

// Pure calculation (no DOM)
function calcCrypto(i) {
  const errors = [], warns = [];
  if (!(i.capital > 0)) errors.push('Capital must be above zero.');
  if (!(i.risk > 0)) errors.push('Risk % must be above zero.');
  if (!(i.trades >= 1)) errors.push('Number of trades must be at least 1.');
  if (!(i.entry > 0) || !(i.sl > 0)) errors.push('Enter entry and stop-loss prices.');
  else if (i.entry === i.sl) errors.push('Entry and stop-loss cannot be equal.');
  if (errors.length) return { errors, warns };

  const dir = i.sl < i.entry ? 'long' : 'short';
  if (i.tp > 0 && (dir === 'long' ? i.tp <= i.entry : i.tp >= i.entry))
    warns.push(`Take-profit is on the wrong side of entry for a ${dir}.`);

  const fee = (i.fee || 0) / 100;
  const riskUsd = i.capital * i.risk / 100 / i.trades;
  const dist = Math.abs(i.entry - i.sl);
  const lossPerCoin = dist + fee * i.entry + fee * i.sl;        // price loss + entry fee + exit fee
  const rawQty = riskUsd / lossPerCoin;
  const qty = floorToStep(rawQty, i.qstep);
  if (qty <= 0) errors.push('Position is smaller than the minimum quantity step. Increase risk or tighten stop.');
  if (errors.length) return { errors, warns };

  const pos = qty * i.entry;
  const perTradeCap = i.capital / i.trades;
  const loss = qty * lossPerCoin;
  let profit = NaN, rr = NaN;
  const tpValid = i.tp > 0 && (dir === 'long' ? i.tp > i.entry : i.tp < i.entry);
  if (tpValid) {
    profit = qty * Math.abs(i.tp - i.entry) - qty * fee * (i.entry + i.tp);
    rr = Math.abs(i.tp - i.entry) / dist;
  }
  const minLev = Math.max(1, Math.ceil(pos / perTradeCap - 1e-9));
  // Rough isolated-margin liquidation: price moves ~1/leverage against you.
  const maxLev = Math.max(1, Math.ceil(i.entry / dist - 1e-9) - 1); // above this, liquidation hits before SL
  if (minLev > maxLev) warns.push(`Needs at least ${minLev}x, but above ${maxLev}x you'd likely be liquidated before your stop-loss. Widen the stop, lower risk, or reduce trades.`);
  const levs = leverageSteps(minLev, maxLev).map(lev => {
    const liq = dir === 'long' ? i.entry * (1 - 1 / lev) : i.entry * (1 + 1 / lev);
    return { lev, margin: pos / lev, liqBeforeSl: dir === 'long' ? liq >= i.sl : liq <= i.sl };
  });

  return { errors, warns, dir, maxLev, qty, rawQty, pos, perTradeCap, minLev, levs, loss, profit, rr };
}

const ids = ['capital', 'risk', 'trades', 'entry', 'sl', 'slPct', 'tp', 'fee', 'qstep'];
let slMode = Store.get('cryptoSlMode', 'price');
let side = Store.get('cryptoSide', 'long');
const $ = (id) => document.getElementById(id);
let last = null;

function render() {
  const i = Object.fromEntries(ids.map(k => [k, num(k)]));
  if (slMode === 'pct') {
    // Derive the SL price from entry and % distance, on the side chosen.
    i.sl = i.entry > 0 && i.slPct > 0 && i.slPct < 100 ? i.entry * (1 + (side === 'long' ? -1 : 1) * i.slPct / 100) : NaN;
  }
  const r = calcCrypto(i);
  $('slHint').textContent = slMode === 'pct'
    ? (Number.isFinite(i.sl) ? `Stop-loss price: ${+i.sl.toFixed(priceDp(i.entry) + 2)}` : 'Pick long or short, then enter the stop-loss % from entry.')
    : 'Long or short is detected automatically from where your stop-loss sits.';
  last = { i, r };
  $('alerts').innerHTML = r.errors.map(e => `<div class="alert err">${e}</div>`).join('') +
    (r.warns || []).map(w => `<div class="alert warn">⚠ ${w}</div>`).join('');
  if (r.errors.length) {
    ['qty', 'loss', 'profit'].forEach(k => $(k).textContent = '—');
    $('qtySub').textContent = ''; $('rr').textContent = ''; $('dir').innerHTML = ''; $('levRows').innerHTML = '';
    return;
  }
  $('dir').innerHTML = `<span class="badge ${r.dir}">${r.dir.toUpperCase()}</span>`;
  $('qty').textContent = fmtNum(r.qty, 8);
  $('qtySub').textContent = `${fmtUsd(r.pos)} position`;
  $('loss').textContent = '-' + fmtUsd(r.loss);
  $('profit').textContent = Number.isFinite(r.profit) ? '+' + fmtUsd(r.profit) : '—';
  $('rr').textContent = Number.isFinite(r.rr) ? `R:R 1 : ${fmtNum(r.rr, 2)}` : 'add a TP';
  $('levRows').innerHTML = r.levs.map((l, n) => {
    const isMax = l.lev === r.maxLev && n > 0;
    const cls = l.liqBeforeSl ? 'liq' : n === 0 || isMax ? 'min' : '';
    const note = l.liqBeforeSl ? 'liq. before SL' : n === 0 ? (l.lev === r.maxLev ? 'min = max' : 'minimum') : isMax ? 'maximum' : '';
    return `<tr class="${cls}"><td>${l.lev}x</td><td>${fmtUsd(l.margin)}</td><td>${note}</td></tr>`;
  }).join('');
}

$('copyQty').addEventListener('click', () => {
  if (!last || last.r.errors.length) return toast('Nothing to copy yet');
  copyText(String(last.r.qty));
});
$('copyPos').addEventListener('click', () => {
  if (!last || last.r.errors.length) return toast('Nothing to copy yet');
  copyText(last.r.pos.toFixed(2));
});

function syncSlMode() {
  document.querySelectorAll('#slModeSeg button').forEach(b => b.classList.toggle('on', b.dataset.m === slMode));
  document.querySelectorAll('#sideSeg button').forEach(b => b.classList.toggle('on', b.dataset.d === side));
  $('sideSeg').hidden = slMode !== 'pct';
  document.querySelector('.sl-price').hidden = slMode !== 'price';
  document.querySelector('.sl-pct').hidden = slMode !== 'pct';
}
document.querySelectorAll('#slModeSeg button').forEach(b => b.addEventListener('click', () => {
  slMode = b.dataset.m; Store.set('cryptoSlMode', slMode); syncSlMode(); render();
}));
document.querySelectorAll('#sideSeg button').forEach(b => b.addEventListener('click', () => {
  side = b.dataset.d; Store.set('cryptoSide', side); syncSlMode(); render();
}));
syncSlMode();

persistInputs('crypto');
ids.forEach(k => $(k).addEventListener('input', render));
render();
initMobileBar('Quantity', 'qty', [['Loss', 'loss'], ['Profit', 'profit']]);
