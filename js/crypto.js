/* Crypto futures position sizing. */
'use strict';

// Pure calculation (no DOM)
function calcCrypto(i) {
  const errors = [], warns = [];
  if (!(i.capital > 0)) errors.push('Capital must be above zero.');
  if (!(i.risk > 0)) errors.push('Risk % must be above zero.');
  if (!(i.trades >= 1)) errors.push('Number of trades must be at least 1.');
  if (!(i.lev >= 1)) errors.push('Leverage must be at least 1.');
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
  const margin = pos / i.lev;
  const perTradeCap = i.capital / i.trades;
  const fees = qty * fee * (i.entry + i.sl);
  const loss = qty * lossPerCoin;
  let profit = NaN, rr = NaN;
  const tpValid = i.tp > 0 && (dir === 'long' ? i.tp > i.entry : i.tp < i.entry);
  if (tpValid) {
    profit = qty * Math.abs(i.tp - i.entry) - qty * fee * (i.entry + i.tp);
    rr = Math.abs(i.tp - i.entry) / dist;
  }
  const minLev = Math.ceil(pos / perTradeCap * 100) / 100;
  if (margin > perTradeCap)
    warns.push(`Margin ${fmtUsd(margin)} exceeds capital per trade ${fmtUsd(perTradeCap)}. Use at least ${Math.ceil(minLev)}x leverage.`);
  const liqApprox = dir === 'long' ? i.entry * (1 - 1 / i.lev) : i.entry * (1 + 1 / i.lev);
  if (dir === 'long' ? liqApprox >= i.sl : liqApprox <= i.sl)
    warns.push(`At ${i.lev}x, rough liquidation (~${fmtNum(liqApprox, priceDp(i.entry))}) is before your stop-loss. Lower leverage.`);

  return { errors, warns, dir, riskUsd, dist, distPct: dist / i.entry * 100, qty, rawQty, pos, margin,
    marginAll: margin * i.trades, perTradeCap, minLev, fees, loss, profit, rr };
}

const ids = ['capital', 'risk', 'trades', 'lev', 'entry', 'sl', 'tp', 'fee', 'qstep'];
const $ = (id) => document.getElementById(id);
let last = null;

function render() {
  const i = Object.fromEntries(ids.map(k => [k, num(k)]));
  const r = calcCrypto(i);
  last = { i, r };
  $('alerts').innerHTML = r.errors.map(e => `<div class="alert err">${e}</div>`).join('') +
    (r.warns || []).map(w => `<div class="alert warn">⚠ ${w}</div>`).join('');
  const blank = ['qty', 'margin', 'pos', 'riskUsd', 'loss', 'profit', 'rr', 'slDist', 'fees', 'marginAll', 'minLev'];
  if (r.errors.length) {
    blank.forEach(k => $(k).textContent = '—');
    ['qtySub', 'marginSub', 'posSub'].forEach(k => $(k).textContent = '');
    $('dir').innerHTML = ''; $('ladder').innerHTML = '';
    return;
  }
  $('dir').innerHTML = `<span class="badge ${r.dir}">${r.dir.toUpperCase()}</span>`;
  $('qty').textContent = fmtNum(r.qty, 8);
  $('qtySub').textContent = r.qty !== r.rawQty ? `exact ${fmtNum(r.rawQty, 8)} → rounded down` : '';
  $('margin').textContent = fmtUsd(r.margin);
  $('marginSub').textContent = `${fmtNum(r.margin / r.perTradeCap * 100, 1)}% of capital per trade`;
  $('pos').textContent = fmtUsd(r.pos);
  $('posSub').textContent = `${i.lev}x leverage`;
  $('riskUsd').textContent = fmtUsd(r.riskUsd);
  $('loss').textContent = '-' + fmtUsd(r.loss);
  $('profit').textContent = Number.isFinite(r.profit) ? '+' + fmtUsd(r.profit) : '—';
  $('rr').textContent = Number.isFinite(r.rr) ? `1 : ${fmtNum(r.rr, 2)}` : '—';
  $('slDist').textContent = `${fmtNum(r.dist, priceDp(i.entry))} (${fmtNum(r.distPct, 2)}%)`;
  $('fees').textContent = fmtUsd(r.fees);
  $('marginAll').textContent = `${fmtUsd(r.marginAll)} (${i.trades} × trade)`;
  const minLevEl = $('minLev');
  minLevEl.textContent = r.minLev <= 1 ? '1x (no leverage needed)' : `${Math.ceil(r.minLev)}x`;
  minLevEl.className = r.margin > r.perTradeCap ? 'down' : '';
  renderLadder($('ladder'), i.entry, i.sl, i.tp);
}

$('copy').addEventListener('click', () => {
  if (!last || last.r.errors.length) return toast('Nothing to copy yet');
  const { i, r } = last;
  copyText([
    `${r.dir.toUpperCase()} | Entry ${i.entry} | SL ${i.sl}${i.tp > 0 ? ' | TP ' + i.tp : ''}`,
    `Qty: ${r.qty}`, `Position: ${fmtUsd(r.pos)} @ ${i.lev}x`, `Margin: ${fmtUsd(r.margin)}`,
    `Loss at SL: -${fmtUsd(r.loss)}` + (Number.isFinite(r.profit) ? ` | Profit at TP: +${fmtUsd(r.profit)} | R:R 1:${fmtNum(r.rr, 2)}` : ''),
  ].join('\n'));
});

persistInputs('crypto');
ids.forEach(k => $(k).addEventListener('input', render));
render();
initMobileBar('Quantity', 'qty', [['Margin', 'margin'], ['Loss', 'loss']]);
