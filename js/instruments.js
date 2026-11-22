/* Default instrument specs. All editable in the UI (saved per symbol in the browser).
   cs = contract size per 1.0 lot, pip = pip/point size, step = lot step, quote = price currency. */
'use strict';

const fxPair = (s) => ({ s, group: 'Forex', type: 'fx', cs: 100000, pip: s.endsWith('JPY') ? 0.01 : 0.0001,
  step: 0.01, base: s.slice(0, 3), quote: s.slice(3), unit: 'pips' });
const cfd = (s, group, cs, pip, quote, label) => ({ s, group, type: 'cfd', cs, pip, step: 0.01, quote, unit: 'points', label });

const INSTRUMENTS = [
  ...['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD'].map(fxPair),
  ...['EURJPY', 'GBPJPY', 'EURGBP', 'AUDJPY', 'EURAUD', 'EURCHF', 'EURCAD', 'GBPAUD', 'GBPCHF', 'GBPCAD',
      'AUDCAD', 'AUDNZD', 'CADJPY', 'CHFJPY', 'NZDJPY'].map(s => ({ ...fxPair(s), group: 'Forex crosses' })),
  cfd('XAUUSD', 'Metals', 100, 0.01, 'USD', 'Gold'),
  cfd('XAGUSD', 'Metals', 5000, 0.001, 'USD', 'Silver'),
  cfd('US30', 'Indices', 1, 1, 'USD', 'Dow Jones'),
  cfd('NAS100', 'Indices', 1, 1, 'USD', 'Nasdaq 100'),
  cfd('SPX500', 'Indices', 1, 1, 'USD', 'S&P 500'),
  cfd('GER40', 'Indices', 1, 1, 'EUR', 'DAX'),
  cfd('UK100', 'Indices', 1, 1, 'GBP', 'FTSE 100'),
  cfd('JP225', 'Indices', 1, 1, 'JPY', 'Nikkei 225'),
  cfd('USOIL', 'Oils', 1000, 0.01, 'USD', 'WTI Crude'),
  cfd('UKOIL', 'Oils', 1000, 0.01, 'USD', 'Brent Crude'),
];
