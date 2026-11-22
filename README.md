# Position Size Calculator

Free, static position sizing site (plain HTML/CSS/JS, no build) hosted on GitHub Pages.

**Live:** https://breakoutplayer.github.io/position-size-calculator/

## Pages
- **Crypto** (`index.html`): quantity, loss at SL, profit at TP and R:R from capital, risk %, number of trades and entry/SL/TP. Fees included (Bitunix futures taker 0.06% on entry and exit, editable). No leverage input: shows the minimum leverage needed and the margin at 5x steps, stopping at the maximum leverage where rough liquidation is still beyond your stop.
- **Forex & CFDs** (`forex.html`): lot size for FX majors/crosses, XAUUSD, XAGUSD, US30, NAS100, SPX500, GER40, UK100, JP225, USOIL, UKOIL. SL/TP as prices or pips/points. No fees.

## Features
- 4 themes (Terminal, Glass, Gold, Ocean), each with dark/light mode (default: Terminal dark)
- Remembers your inputs, copy-results button
- Lots/qty rounded down to step, showing actual risk after rounding
- Live FX rates from [Frankfurter](https://frankfurter.dev) (free, no key) with manual override
- Installable PWA, works offline

## Formulas
**Crypto**
- risk $ = capital × risk % ÷ trades
- qty = risk $ ÷ (|entry − SL| + fee × entry + fee × SL), floored to qty step
- position = qty × entry; min leverage = ceil(position ÷ (capital ÷ trades)); margin = position ÷ leverage

**Forex / CFD** (account in USD)
- risk $ = balance × risk % ÷ trades
- lots = risk $ ÷ (SL distance × contract size × quote→USD), floored to lot step
- margin = lots × contract size × price (in USD) ÷ leverage

## Default contract sizes (edit per symbol in the app)
FX 100,000 · XAUUSD 100 oz · XAGUSD 5,000 oz · indices 1 · oils 1,000 bbl. Brokers differ: verify yours.

## Deploy
Settings → Pages → Source: *Deploy from a branch* → `main` / `(root)`.

## Disclaimer
Estimates only. Not financial advice.
