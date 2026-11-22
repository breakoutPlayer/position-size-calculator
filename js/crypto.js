/* Crypto futures position sizing. */
'use strict';

// Leverage steps: minimum required, then multiples of 5 up to 50x (or 5 more steps if min is above 50x).
function leverageSteps(minLev) {
  const steps = [minLev];
  let next = Math.floor(minLev / 5) * 5 + 5;
  const cap = minLev < 50 ? 50 : next + 20;
  for (; next <= cap; next += 5) steps.push(next);
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
  const levs = leverageSteps(minLev).map(lev => {
    const liq = dir === 'long' ? i.entry * (1 - 1 / lev) : i.entry * (1 + 1 / lev);
    return { lev, margin: pos / lev, liqBeforeSl: dir === 'long' ? liq >= i.sl : liq <= i.sl };
  });

  return { errors, warns, dir, qty, rawQty, pos, perTradeCap, minLev, levs, loss, profit, rr };
}

const ids = ['capital', 'risk', 'trades', 'entry', 'sl', 'tp', 'fee', 'qstep'];
const $ = (id) => document.getElementById(id);
let last = null;

function render() {
  const i = Object.fromEntries(ids.map(k => [k, num(k)]));
  const r = calcCrypto(i);
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
    const cls = l.liqBeforeSl ? 'liq' : n === 0 ? 'min' : '';
    const note = l.liqBeforeSl ? 'liq. before SL' : n === 0 ? 'minimum' : '';
    return `<tr class="${cls}"><td>${l.lev}x</td><td>${fmtUsd(l.margin)}</td><td>${note}</td></tr>`;
  }).join('');
}

$('copy').addEventListener('click', () => {
  if (!last || last.r.errors.length) return toast('Nothing to copy yet');
  const { i, r } = last;
  copyText([
    `${r.dir.toUpperCase()} | Entry ${i.entry} | SL ${i.sl}${i.tp > 0 ? ' | TP ' + i.tp : ''}`,
    `Qty: ${r.qty}`, `Min leverage: ${r.minLev}x (margin ${fmtUsd(r.pos / r.minLev)})`,
    `Loss at SL: -${fmtUsd(r.loss)}` + (Number.isFinite(r.profit) ? ` | Profit at TP: +${fmtUsd(r.profit)} | R:R 1:${fmtNum(r.rr, 2)}` : ''),
  ].join('\n'));
});

persistInputs('crypto');
ids.forEach(k => $(k).addEventListener('input', render));
render();
initMobileBar('Quantity', 'qty', [['Loss', 'loss'], ['Profit', 'profit']]);
