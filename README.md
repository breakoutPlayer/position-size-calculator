# Position Size Calculator

A static, offline position sizing tool built with HTML, CSS and vanilla JavaScript. No build step, no network calls.

## Features
- Risk-based or custom-lot sizing, long and short
- Six visible asset categories, 60+ editable instruments (crypto is one generic contract), cross-category search
- Pip, tick and contract-size methods, quote-to-USD conversion (estimate or your override)
- Margin from leverage, or a margin rate override
- Risk-to-reward and a partial take-profit calculator
- Dark/light theme, saved settings, copy trade details

## Edit instrument specs
Change values in **Advanced instrument settings** (saved as overrides, with a reset button), or edit the `DEFAULTS` list at the top of `script.js`.

## How it calculates
- Dollar risk = balance x risk % / 100
- Stop distance must sit on the correct side of entry. The exit price you enter is treated as the stop-loss.
- Loss per lot = distance x contract size (linear/fx) or distance / tick size x tick value (tick), converted to USD
- Lots are rounded down to the lot step, never up to the minimum
- Margin = notional / leverage, unless a margin rate is set
- Quote-to-USD: exact for USDxxx pairs, otherwise a built-in estimate (`EST_RATES`) that you can override

## Disclaimer
Default specifications are generic illustrations. Verify contract size, tick value, lot limits and margin with your broker. Results are estimates, not guarantees.
