# InvestIQ broker fixtures (Step 4a)

All data is fake. Errors ("cannot read") are 0 in every file. Ready counts include cash rows. The counts below are what `tests/unit/import-presets-fixtures.test.ts` asserts.

Updated 2026-10-01 to the verified layouts (spec section "Verified broker export formats"). Columns are matched by NAME, so column order never matters.

| File | Ready | Skipped | Errors | Special rows |
|---|---|---|---|---|
| trading212.csv | 9 (1 with a note) | 3 | 0 | Verified header (Time, Notes, ID, optional Finra fee columns). Row 10 (AAPL buy, 0.30 EUR fee) = imported with a note, fee 0. Row 12 has a fractional-seconds time (`2026-05-04 14:30:03.613`). Skipped: T0000007 (GBX), T0000008 (interest), T0000009 (currency conversion). T0000005 has Result 17.20, ignored, and a 0.02 Finra fee. T0000006 dividend = 4.33 + 0.77 tax = 5.10 gross. |
| ibkr-activity.csv | 7 | 4 | 0 | Skipped: SAP (EUR), AAPL option, interest 1.12, NVDA split. Ignored: sub-total, total, "Total" currency line, Net Asset Value section. AAPL dividend 2.40 + 0.36 tax paired. Fee 4.50 has no ticker. (Activity Statement layout is Beta.) |
| ibkr-flex.csv | 3 | 2 | 0 | Skipped: SAP (EUR), option (OPT). Date style YYYYMMDD, quantity unsigned, TransactionID is the reference. |
| saxo.csv | 4 | 3 | 0 | New real layout: `Trade Date`, `Event` text ("Buy 10 @ 205.40 USD"), comma-decimal `Amount`, `DD-MMM-YYYY` dates, `Order ID` is the reference. No quantity, price or commission columns, so fees are 0. No dividend or tax rows: Saxo deposits and fees are skipped. Skipped: SAP (EUR), NVDA corporate action, cash deposit line. |
| etoro.csv | 7 | 1 | 0 | Newest first. `Units` header, `-` for empty cells, thousands commas (`"2,054.00"`). Skipped: BTC row (Crypto). Dividend is 4.33 with fee 0 (eToro states it after tax, no separate tax row). Sell price worked out as 856 / 4 = 214. |
| schwab.csv | 8 | 2 | 0 | Newest first (SELL appears before its BUY). "as of" dates on three rows: the FIRST (posted) date is used, so the dividend is dated 2026-03-15 (not 03-14) and the MSFT buy 2026-03-17. Tax row absorbed into dividend (fee 0.77). Skipped: NVDA split, option. Title line and "Transactions Total" line are structural (2 ignored). |
| fidelity.csv | 7 | 3 | 0 | Two blank lines first, blank line and two disclaimer lines last. Newest first. Action has leading space. Skipped: NVDA split, ABX (CAD), MSFT reinvestment. Tax row absorbed into dividend. Sell quantity -4. (Beta.) |
| template-gulf.csv | 8 | 2 | 0 | Skipped: NVDA "Split" (unrecognised word), ABC (EUR). Includes BKMB (MSX/OMR), 2222.SR (TADAWUL/SAR), AAPL (US/USD). |

`../investiq-gulf-template.csv` is the original downloadable template; the live copy is `public/broker-template.csv` (header plus 2 example rows).

## Notes on the spec
- The spec's Trading 212 and IBKR Activity counts were clumsily worded; the numbers above are the confirmed ones.
- Spec section 12 check 7 says the KO dividend shows 5.10 with 0.77 tax in every fixture. That is not true for eToro (4.33, fee 0, no separate tax row), IBKR (AAPL 2.40 with 0.36) or the new Saxo layout (no dividend rows). It holds for Trading 212, Schwab and Fidelity only.
- Trading 212 story: deposits (2000) are less than buys, so cash would go negative. InvestIQ does not check cash, but it is not a realistic account.
- Schwab "Tfr JANE SAMPLE, SAMPLE" is an invented name, kept from the spec. It is never copied anywhere.
- Fidelity older-header version is not a file; it is tested with an inline string.
- Saxo's real export has no deposit rows in a known format, so the Saxo fixture can only prove trades. The narrow Saxo dividend reading is covered by an inline test, not a fixture.
