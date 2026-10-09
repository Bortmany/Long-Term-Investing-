# Twelve Data sample replies

Every file here is MADE UP. It is shaped like what Twelve Data's public
documentation says a quote reply looks like, but it was never recorded from the
real service (no key exists). The tests and `scripts/fake-twelve-data.mjs` use
these files so nothing ever calls Twelve Data.

Before a paid key goes on the live site, replace these with real recorded
replies (one per market) and correct the market table in
`src/lib/data/provider-info.ts` — see "Gulf live prices (Twelve Data)" in
`GO-LIVE.md`.

| File | What it stands for |
|---|---|
| `tadawul-2222.json` | Saudi Aramco, end of day, SAR |
| `adx-fab.json` | First Abu Dhabi Bank, AED |
| `qse-qnbk.json` | Qatar National Bank, QAR |
| `dfm-emaar.json` | Emaar, AED (Dubai, only when switched on) |
| `error-bad-symbol.json` | The vendor's error sent inside a normal-looking reply |
| `error-rate-limited.json` | The vendor's "out of credits" answer |

The wrong-exchange, wrong-currency and bad-price cases are built inside the
tests by changing one field of the files above.
