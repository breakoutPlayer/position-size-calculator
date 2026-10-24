/* Position Size Calculator. Sections: config, calc (pure), storage, UI. */
'use strict';

/* ---------- Instrument config (generic, editable defaults) ---------- */
// Estimated quote->USD rates. Illustrative only; override in the UI.
const EST_RATES = {USD:1, EUR:1.08, GBP:1.27, JPY:0.0066, CAD:0.73, CHF:1.12, AUD:0.65, NZD:0.60, HKD:0.128};
const J = (s) => s.endsWith('JPY');
const fx = (s) => ({s, cat:'Forex', cs:100000, min:.01, max:100, step:.01, pip:J(s)?0.01:0.0001, tick:J(s)?0.001:0.00001, tickVal:1, quote:s.slice(3), lev:1, m:'fx'});
const lin = (s, cat, cs, quote, o={}) => Object.assign({s, cat, cs, min:.01, max:100, step:.01, pip:0, tick:.01, tickVal:1, quote, lev:1, m:'linear'}, o);
const DEFAULTS = [
  ...'EURUSD GBPUSD AUDUSD NZDUSD USDCAD USDCHF USDJPY EURJPY GBPJPY EURGBP EURAUD GBPAUD AUDJPY CADJPY CHFJPY EURNZD GBPNZD AUDNZD CADCHF AUDCAD NZDCAD NZDJPY EURCAD EURCHF GBPCAD GBPCHF AUDCHF NZDCHF'.split(' ').map(fx),
  lin('XAUUSD','Gold',100,'USD'), lin('XAUEUR','Gold',100,'EUR'), lin('XAUGBP','Gold',100,'GBP'),
  lin('XAGUSD','Silver',5000,'USD',{tick:.001}), lin('XAGEUR','Silver',5000,'EUR',{tick:.001}), lin('XAGGBP','Silver',5000,'GBP',{tick:.001}),
  ...[['US30','USD'],['US100','USD'],['US500','USD'],['US2000','USD'],['UK100','GBP'],['GER40','EUR'],['FRA40','EUR'],['JP225','JPY'],['AUS200','AUD'],['HK50','HKD']].map(([s,q]) => lin(s,'Indices',1,q,{min:.1,step:.1,tick:1})),
  lin('USOIL','Oils',1000,'USD'), lin('UKOIL','Oils',1000,'USD'), lin('XTIUSD','Oils',1000,'USD'), lin('XBRUSD','Oils',1000,'USD'), lin('NATGAS','Oils',10000,'USD',{tick:.001}),
  ...'BTC ETH SOL XRP LTC ADA DOGE'.split(' ').map(c => lin(c+'USD','Crypto',1,'USD',{max:1000,tick:c==='BTC'?1:.01}))
];
const CATS = ['Forex','Gold','Silver','Indices','Oils','Crypto'];

/* ---------- Pure calculation functions (no DOM) ---------- */
const decimals = (n) => (String(n).split('.')[1] || '').length;
const calculateDollarRisk = (bal, pct) => bal * pct / 100;
const calculateStopDistance = (dir, entry, sl) => dir === 'long' ? entry - sl : sl - entry; // must be > 0
const aligned = (v, step) => Math.abs(v / step - Math.round(v / step)) < 1e-6;
const floorToStep = (v, step) => +(Math.floor(v / step + 1e-9) * step).toFixed(decimals(step));

// Quote currency -> USD. Returns {rate, estimated} or {rate:null}.
function quoteToUsd(inst, entry, override) {
  if (inst.quote === 'USD') return {rate:1, estimated:false};
  if (override > 0) return {rate:override, estimated:false};
  if (inst.m === 'fx' && inst.s.startsWith('USD')) return {rate:1 / entry, estimated:false}; // exact for USDxxx
  if (EST_RATES[inst.quote]) return {rate:EST_RATES[inst.quote], estimated:true};
  return {rate:null};
}
const calculateLossPerLot = (inst, dist, q2u) =>
  (inst.m === 'tick' ? dist / inst.tick * inst.tickVal : dist * inst.cs) * q2u;
// USD value of one pip (fx) or one tick, per lot
const valuePerLot = (inst, q2u) =>
  inst.m === 'tick' ? inst.tickVal * q2u : (inst.pip > 0 ? inst.pip : inst.tick) * inst.cs * q2u;
function calculateNotionalUsd(inst, lots, entry, q2u) {
  if (inst.m === 'fx') {
    const base = inst.s.slice(0,3);
    const b2u = base === 'USD' ? 1 : inst.quote === 'USD' ? entry : EST_RATES[base];
    return b2u ? lots * inst.cs * b2u : null;
  }
  return lots * inst.cs * entry * q2u;
}
const calculateMargin = (notional, lev, rate) => notional == null ? null : rate > 0 ? notional * rate / 100 : notional / lev;
function calculatePartialProfits(risk, rows) {
  let cum = 0, used = 0;
  const out = rows.map(r => { const p = risk * r.rr * r.pct / 100; cum += p; used += r.pct; return {p, cum, left:100 - used}; });
  return {out, total:cum, used};
}
function validateTradeInputs(i, inst) {
  const e = [];
  if (!(i.bal > 0)) e.push('Account balance must be above zero.');
  if (!(i.risk > 0)) e.push('Risk percentage must be above zero.');
  if (!(i.lev >= 1)) e.push('Leverage must be at least 1.');
  if (!(inst.cs > 0)) e.push('Contract size must be above zero.');
  if (!(inst.step > 0) || !(inst.min > 0) || inst.max < inst.min) e.push('Lot specs are invalid: check min, max and step.');
  else if (!aligned(inst.min, inst.step)) e.push('Minimum lot is not a multiple of the lot step.');
  if (inst.m === 'tick' && !(inst.tick > 0 && inst.tickVal > 0)) e.push('Tick size and tick value are required for the tick method.');
  if (inst.m === 'fx' && !(inst.pip > 0)) e.push('Pip size is required for Forex.');
  if (!(i.entry > 0)) e.push('Enter a positive entry price.');
  if (!(i.sl > 0)) e.push('Enter a positive stop-loss price.');
  if (i.entry > 0 && i.sl > 0) {
    if (i.entry === i.sl) e.push('Entry and stop-loss are equal, so there is no risk distance.');
    else if (calculateStopDistance(i.dir, i.entry, i.sl) < 0)
      e.push(i.dir === 'long' ? 'For a long trade the stop-loss must be below entry.' : 'For a short trade the stop-loss must be above entry.');
  }
  if (i.tp > 0 && i.entry > 0 && (i.dir === 'long' ? i.tp <= i.entry : i.tp >= i.entry))
    e.push(i.dir === 'long' ? 'Take-profit must be above entry for a long.' : 'Take-profit must be below entry for a short.');
  return e;
}
function calculatePositionSize(i, inst) {
  const errors = validateTradeInputs(i, inst), warns = [];
  const budget = calculateDollarRisk(i.bal, i.risk);
  if (errors.length) return {errors, warns, budget};
  const q = quoteToUsd(inst, i.entry, i.fxo);
  if (q.rate == null) return {errors:[`No conversion rate for ${inst.quote}. Enter a quote-to-USD rate.`], warns, budget};
  if (q.estimated) warns.push(`Using an estimated ${inst.quote}/USD rate of ${q.rate}. Enter your own rate for accuracy.`);
  if (inst.m === 'fx' && !inst.s.startsWith('USD') && inst.quote !== 'USD' && !EST_RATES[inst.s.slice(0,3)]) warns.push('Base currency rate unknown: margin unavailable.');
  const dist = calculateStopDistance(i.dir, i.entry, i.sl);
  const perLot = calculateLossPerLot(inst, dist, q.rate) + Math.max(0, i.cost || 0);
  const raw = budget / perLot;
  let lots, note = '';
  if (i.mode === 'custom') {
    lots = i.lot;
    if (!(lots > 0)) return {errors:['Enter a custom lot size.'], warns, budget};
    if (lots < inst.min) return {errors:[`Custom lot is below the minimum of ${inst.min}.`], warns, budget};
    if (lots > inst.max) return {errors:[`Custom lot is above the maximum of ${inst.max}.`], warns, budget};
    if (!aligned(lots, inst.step)) return {errors:[`Custom lot must be a multiple of ${inst.step}.`], warns, budget};
  } else {
    lots = floorToStep(raw, inst.step);
    if (lots < inst.min) return {errors:[`The minimum lot (${inst.min}) risks more than your budget. Raw size was ${raw.toFixed(4)} lots.`], warns, budget, perLot};
    if (lots > inst.max) { lots = inst.max; note = `Capped at the maximum lot of ${inst.max}.`; }
  }
  const risk = lots * perLot;
  if (risk > budget * 1.000001) warns.push(`This size risks ${fmt(risk)}, above your ${fmt(budget)} budget.`);
  if (note) warns.push(note);
  const notional = calculateNotionalUsd(inst, lots, i.entry, q.rate);
  const margin = calculateMargin(notional, i.lev, inst.marginRate);
  let rr = null, reward = null;
  const rewardDist = i.tp > 0 ? Math.abs(i.tp - i.entry) : dist * (i.rr > 0 ? i.rr : 0);
  if (rewardDist > 0) { rr = rewardDist / dist; reward = lots * calculateLossPerLot(inst, rewardDist, q.rate) - lots * Math.max(0, i.cost || 0); }
  return {errors, warns, budget, dist, pips:inst.m === 'fx' ? dist / inst.pip : dist / inst.tick, perLot, raw, lots, risk,
    riskPct:risk / i.bal * 100, notional, margin, unit:lots * inst.cs, pv:lots * valuePerLot(inst, q.rate), rr, reward};
}

/* ---------- Formatting ---------- */
const fmt = (n) => n == null || !isFinite(n) ? 'n/a' : n.toLocaleString('en-US', {style:'currency', currency:'USD'});
const num = (n, d=2) => n == null || !isFinite(n) ? 'n/a' : n.toLocaleString('en-US', {maximumFractionDigits:d});

/* ---------- Storage (falls back to memory) ---------- */
let storageOk = true;
const store = {
  get(k, d) { try { const v = localStorage.getItem('psc_' + k); return v == null ? d : JSON.parse(v); } catch { storageOk = false; return d; } },
  set(k, v) { try { localStorage.setItem('psc_' + k, JSON.stringify(v)); } catch { storageOk = false; } }
};

/* ---------- State ---------- */
const $ = (id) => document.getElementById(id);
const S = {
  bal:store.get('bal', 100000), risk:store.get('risk', 0.3), lev:store.get('lev', 1),
  cat:'Forex', sym:store.get('sym', 'EURUSD'), dir:'long', mode:'risk',
  over:store.get('over', {}), parts:store.get('parts', [{rr:2, pct:50}, {rr:4, pct:50}]), last:null
};
const instBase = () => DEFAULTS.find(d => d.s === S.sym) || DEFAULTS[0];
const inst = () => Object.assign({}, instBase(), S.over[S.sym] || {});
const num0 = (id) => parseFloat($(id).value);

/* ---------- UI ---------- */
function el(tag, props = {}, text) { const n = document.createElement(tag); Object.assign(n, props); if (text != null) n.textContent = text; return n; }
function addRow(dl, k, v, cls = '') { dl.append(el('dt', {className:cls.includes('key') ? 'key' : ''}, k), el('dd', {className:cls}, v)); }

function renderChips() {
  const cats = $('cats'); cats.replaceChildren();
  CATS.forEach(c => { const b = el('button', {className:c === S.cat ? 'on' : ''}, c); b.onclick = () => { S.cat = c; $('search').value = ''; renderChips(); }; cats.append(b); });
  const q = $('search').value.trim().toUpperCase();
  const list = DEFAULTS.filter(d => q ? d.s.includes(q) : d.cat === S.cat);
  const box = $('insts'); box.replaceChildren();
  if (!list.length) box.append(el('span', {className:'hint'}, 'No instrument matches your search.'));
  list.forEach(d => { const b = el('button', {className:d.s === S.sym ? 'on' : ''}, d.s); b.onclick = () => { S.sym = d.s; S.cat = d.cat; store.set('sym', d.s); renderChips(); renderAdv(); update(); }; box.append(b); });
}
const ADV = [['cs','Contract size'],['min','Min lot'],['max','Max lot'],['step','Lot step'],['tick','Tick size'],['tickVal','Tick value (quote ccy/lot)'],['pip','Pip size'],['lev','Default leverage'],['marginRate','Margin rate % (optional)'],['quote','Quote currency'],['m','Method']];
function renderAdv() {
  const box = $('adv'); box.replaceChildren(); const cur = inst();
  ADV.forEach(([k, lab]) => {
    const l = el('label', {}, lab);
    let inp;
    if (k === 'm') { inp = el('select'); ['fx','linear','tick'].forEach(o => inp.append(el('option', {value:o, selected:cur.m === o}, o))); }
    else inp = el('input', {type:k === 'quote' ? 'text' : 'number', step:'any', value:cur[k] ?? ''});
    inp.oninput = () => {
      const o = S.over[S.sym] = S.over[S.sym] || {};
      o[k] = k === 'quote' ? inp.value.toUpperCase() : k === 'm' ? inp.value : (inp.value === '' ? undefined : parseFloat(inp.value));
      store.set('over', S.over); update();
    };
    l.append(inp); box.append(l);
  });
}
function renderParts(r) {
  const box = $('parts'); box.replaceChildren();
  S.parts.forEach((p, idx) => {
    const row = el('div', {className:'prow'});
    const a = el('label', {}, 'Target RR'), ai = el('input', {type:'number', step:'any', value:p.rr});
    const b = el('label', {}, 'Close %'), bi = el('input', {type:'number', step:'any', value:p.pct});
    ai.oninput = () => { p.rr = parseFloat(ai.value) || 0; saveParts(); update(true); };
    bi.oninput = () => { p.pct = parseFloat(bi.value) || 0; saveParts(); update(true); };
    const rm = el('button', {className:'btn', title:'Remove exit'}, 'Remove'); rm.onclick = () => { S.parts.splice(idx, 1); saveParts(); renderParts(); update(); };
    a.append(ai); b.append(bi); row.append(a, b, rm); box.append(row);
  });
}
const saveParts = () => store.set('parts', S.parts);

function renderPartials() {
  const dl = $('partRes'); dl.replaceChildren();
  const r = S.last;
  if (!r || r.errors.length || !r.risk) { addRow(dl, 'Waiting for a valid trade', ''); return; }
  const used = S.parts.reduce((s, p) => s + p.pct, 0);
  if (used > 100) { dl.append(el('div', {className:'err'}, `Exits total ${num(used)}%. Keep the total at 100% or less.`)); return; }
  const pr = calculatePartialProfits(r.risk, S.parts);
  pr.out.forEach((o, i) => addRow(dl, `Exit ${i + 1}: ${num(S.parts[i].pct)}% at ${num(S.parts[i].rr)}R`, `${fmt(o.p)} (cum. ${fmt(o.cum)}, ${num(o.left)}% left)`, 'gn'));
  if (used < 100) addRow(dl, 'Unallocated position', `${num(100 - used)}%`);
  addRow(dl, 'Total potential profit', `${fmt(pr.total)} (${num(pr.total / r.risk)}R)`, 'gn key');
  addRow(dl, 'Excludes costs, slippage and swaps', '');
}

function readInputs() {
  const c = inst();
  return {bal:S.bal, risk:S.risk, lev:S.lev, dir:S.dir, mode:S.mode, entry:num0('entry'), sl:num0('sl'), tp:num0('tp'),
    rr:num0('rr'), lot:num0('lot'), fxo:num0('fxo'), cost:num0('cost') || 0, sym:c.s};
}
function update(partialOnly) {
  $('dr').textContent = fmt(calculateDollarRisk(S.bal, S.risk));
  if (partialOnly) { renderPartials(); return; }
  const c = inst(), i = readInputs();
  const r = S.last = calculatePositionSize(i, c);
  const errs = $('errs'); errs.replaceChildren();
  r.errors.forEach(m => errs.append(el('div', {className:'err'}, m)));
  r.warns.forEach(m => errs.append(el('div', {className:'warn'}, m)));
  const dl = $('res'); dl.replaceChildren();
  addRow(dl, 'Risk budget', fmt(r.budget));
  if (!r.errors.length) {
    const fx = c.m === 'fx';
    addRow(dl, 'Position size', `${r.lots.toFixed(decimals(c.step))} lots`, 'key');
    addRow(dl, 'Contract units', num(r.unit, 4));
    addRow(dl, 'Estimated risk (rounded size)', `${fmt(r.risk)} (${num(r.riskPct, 3)}%)`, 'rd');
    addRow(dl, 'Estimated margin', r.margin == null ? 'unavailable' : fmt(r.margin));
    addRow(dl, fx ? 'Pip value for position' : 'Tick value for position', fmt(r.pv));
    addRow(dl, 'Risk-to-reward', r.rr ? `1:${num(r.rr)}` : 'add a TP or RR');
    addRow(dl, 'Potential profit', r.reward == null ? 'n/a' : fmt(r.reward), 'gn');
    addRow(dl, 'Stop distance', `${num(r.dist, 6)} price units`);
    addRow(dl, fx ? 'Pip distance' : 'Tick distance', num(r.pips, 1));
    addRow(dl, 'Loss per lot (incl. costs)', fmt(r.perLot));
    if (S.mode === 'risk') addRow(dl, 'Raw lot size', num(r.raw, 5));
    addRow(dl, 'Notional', fmt(r.notional));
  }
  renderPartials();
}

function copyTradeDetails() {
  const r = S.last, i = readInputs();
  if (!r || r.errors.length) return flash('Fix the errors before copying.', true);
  const t = [`Instrument: ${i.sym}`, `Direction: ${i.dir === 'long' ? 'BUY' : 'SELL'}`, `Account Balance: ${fmt(S.bal)}`, `Risk: ${S.risk}%`, `Risk Budget: ${fmt(r.budget)}`,
    `Entry: ${i.entry}`, `Stop Loss: ${i.sl}`, i.tp > 0 ? `Take Profit: ${i.tp}` : null, `Position Size: ${r.lots} lots`, `Estimated Risk: ${fmt(r.risk)}`,
    `Estimated Margin: ${r.margin == null ? 'unavailable' : fmt(r.margin)}`, r.rr ? `Risk-to-Reward: 1:${num(r.rr)}` : null].filter(Boolean).join('\n');
  const fallback = () => { const ta = el('textarea', {value:t}); document.body.append(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch {} ta.remove(); flash(ok ? 'Copied.' : 'Copy failed. Select the text manually.', !ok); };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(() => flash('Copied.'), fallback); else fallback();
}
function flash(m, bad) { const e = $('msg'); e.textContent = m; e.className = bad ? 'err' : 'gn'; setTimeout(() => e.textContent = '', 2500); }

function init() {
  document.documentElement.dataset.theme = store.get('theme', 'dark');
  $('theme').onclick = () => { const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = t; store.set('theme', t); };
  $('bal').value = S.bal; $('risk').value = S.risk; $('lev').value = S.lev;
  $('bal').oninput = () => { S.bal = num0('bal'); store.set('bal', S.bal); update(); };
  $('risk').oninput = () => { S.risk = num0('risk'); store.set('risk', S.risk); update(); };
  $('lev').oninput = () => { S.lev = num0('lev'); store.set('lev', S.lev); update(); };
  const pb = $('presets');
  [0.1, 0.25, 0.3, 0.5, 1].forEach(p => { const b = el('button', {}, p + '%'); b.onclick = () => { S.risk = p; $('risk').value = p; store.set('risk', p); update(); }; pb.append(b); });
  pb.append(el('span', {className:'hint'}, 'Custom: type in the Risk % box.'));
  $('search').oninput = renderChips;
  document.querySelectorAll('#dir button').forEach(b => b.onclick = () => { S.dir = b.dataset.d; document.querySelectorAll('#dir button').forEach(x => x.classList.toggle('on', x === b)); update(); });
  document.querySelectorAll('#mode button').forEach(b => b.onclick = () => { S.mode = b.dataset.m; $('lotWrap').hidden = S.mode !== 'custom'; document.querySelectorAll('#mode button').forEach(x => x.classList.toggle('on', x === b)); update(); });
  ['entry','sl','tp','rr','lot','fxo','cost'].forEach(id => $(id).oninput = () => update());
  $('resetSpec').onclick = () => { delete S.over[S.sym]; store.set('over', S.over); renderAdv(); update(); };
  $('addPart').onclick = () => { S.parts.push({rr:2, pct:0}); saveParts(); renderParts(); update(); };
  $('copy').onclick = copyTradeDetails;
  renderChips(); renderAdv(); renderParts(); update();
  if (!storageOk) { const n = $('notice'); n.hidden = false; n.textContent = 'Browser storage is unavailable. Settings will not persist after you close this page.'; }
}
init();
