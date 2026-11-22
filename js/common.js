/* Shared: theme, storage, formatting, copy, PWA registration. */
'use strict';

const Store = {
  get(key, fallback) {
    try { const v = localStorage.getItem('psc:' + key); return v == null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  },
  set(key, val) { try { localStorage.setItem('psc:' + key, JSON.stringify(val)); } catch {} },
};

// Apply theme early (script loaded in <head>) to avoid a flash.
(function applyTheme() {
  const root = document.documentElement;
  root.dataset.theme = Store.get('theme', 'terminal');
  root.dataset.mode = Store.get('mode', window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
})();

function initThemeControls() {
  const root = document.documentElement;
  const sw = document.querySelectorAll('.swatch');
  const mode = document.getElementById('modeBtn');
  const sync = () => {
    sw.forEach(b => b.classList.toggle('on', b.dataset.t === root.dataset.theme));
    mode.textContent = root.dataset.mode === 'dark' ? '☀' : '☾';
    mode.title = root.dataset.mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  };
  sw.forEach(b => b.addEventListener('click', () => { root.dataset.theme = b.dataset.t; Store.set('theme', b.dataset.t); sync(); }));
  mode.addEventListener('click', () => {
    root.dataset.mode = root.dataset.mode === 'dark' ? 'light' : 'dark';
    Store.set('mode', root.dataset.mode); sync();
  });
  sync();
}

const num = (id) => { const v = parseFloat(document.getElementById(id).value); return Number.isFinite(v) ? v : NaN; };
const decimalsOf = (n) => (String(n).split('.')[1] || '').length;
const floorToStep = (v, step) => step > 0 ? +(Math.floor(v / step + 1e-9) * step).toFixed(decimalsOf(step)) : v;

function fmtUsd(v, d = 2) {
  if (!Number.isFinite(v)) return '—';
  return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtNum(v, d = 4) {
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString('en-US', { maximumFractionDigits: d });
}
// Sensible decimals for a price
function priceDp(p) { return p >= 1000 ? 2 : p >= 10 ? 3 : p >= 1 ? 4 : 6; }

// Save/restore all inputs with data-save inside a scope
function persistInputs(scope) {
  const saved = Store.get('inputs:' + scope, {});
  document.querySelectorAll('[data-save]').forEach(el => {
    if (saved[el.id] != null) el.value = saved[el.id];
    el.addEventListener('input', () => { saved[el.id] = el.value; Store.set('inputs:' + scope, saved); });
  });
}

function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 1600);
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied to clipboard'); }
  catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta);
    ta.select(); document.execCommand('copy'); ta.remove(); toast('Copied to clipboard');
  }
}

// Visual Entry / SL / TP ladder
function renderLadder(el, entry, sl, tp) {
  if (!(entry > 0 && sl > 0)) { el.innerHTML = ''; return; }
  const pts = [entry, sl]; if (tp > 0) pts.push(tp);
  const lo = Math.min(...pts), hi = Math.max(...pts), span = hi - lo || 1;
  const pos = (p) => 14 + (p - lo) / span * 72; // % with padding so edge labels fit
  const dp = priceDp(entry);
  const bar = (a, b, cls) => `<div class="bar ${cls}" style="left:${Math.min(pos(a), pos(b))}%;width:${Math.abs(pos(a) - pos(b))}%"></div>`;
  let html = bar(entry, sl, 'loss');
  if (tp > 0) html += bar(entry, tp, 'win');
  html += `<div class="tick down" style="left:${pos(sl)}%">SL ${sl.toFixed(dp)}</div>`;
  html += `<div class="tick" style="left:${pos(entry)}%">Entry</div>`;
  if (tp > 0) html += `<div class="tick up" style="left:${pos(tp)}%">TP ${tp.toFixed(dp)}</div>`;
  el.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', initThemeControls);
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// Mobile bottom bar: mirrors main result; tap scrolls to results; hides when results are visible.
function initMobileBar(label, mainId, subIds) {
  const res = document.getElementById(mainId).closest('.card');
  const bar = document.createElement('button');
  bar.className = 'mbar'; bar.type = 'button';
  bar.innerHTML = `<div><div class="k">${label}</div><div class="v"></div></div><div class="v2"></div>`;
  document.body.appendChild(bar);
  const sync = () => {
    bar.querySelector('.v').textContent = document.getElementById(mainId).textContent;
    bar.querySelector('.v2').innerHTML = subIds.map(([k, id]) => `${k} ${document.getElementById(id).textContent}`).join('<br>');
  };
  new MutationObserver(sync).observe(res, { subtree: true, childList: true, characterData: true });
  bar.addEventListener('click', () => res.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  new IntersectionObserver(([e]) => bar.classList.toggle('hide', e.isIntersecting), { threshold: 0.05 }).observe(res);
  sync();
}
