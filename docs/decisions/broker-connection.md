# Decision 1.6: Broker connection (checked 2026-09-30)

## Plain-English summary
We want holdings and past trades to arrive automatically, with no way to trade. Two real options exist. Both are read-only. CSV import covers every other broker.

## Comparison
| | IBKR Flex Web Service | SnapTrade (aggregator) | Others |
|---|---|---|---|
| Brokers covered | Interactive Brokers only | 35+ brokers, including eToro, DEGIRO, E*TRADE, Chase and Coinbase. Schwab, Fidelity, IBKR and Trading 212 are widely reported but not confirmed on the pages we could read. Saxo is unconfirmed. No Gulf brokers seen. | Plaid Investments and Yodlee: US and Canada focus, enterprise pricing, no Gulf coverage. Vezgo: mainly crypto. Not recommended. |
| Read-only guarantee | Yes. The token can only fetch reports and cannot place trades. | Yes for the "Read" connection type. The $1 plan is read-only by design. Some brokers offer read-and-trade, so we must request read-only. | n/a |
| Sandbox | None needed. The user's own IBKR account is the test, and IBKR has a paper account. | Yes. Free "Build" plan with 5 connected accounts. | n/a |
| Cost per connection per month | $0 | $1 (daily data, read-only) plus $100 base plan. Personal/OAuth users are free "for a limited time". | Enterprise quotes |
| Data | Holdings, trades, cash movements, dividends, fees. Any history up to 365 days per request. | Holdings, balances and transactions. Depth varies by broker. | n/a |
| User setup | About 5 minutes in IBKR: Performance & Reports > Flex Queries. Create a query, switch on Flex Web Service, generate a token (default 6-hour expiry, can be locked to one IP), then paste the token and query ID into InvestIQ. | Click "Connect", log in at the broker, and approve. | n/a |

Watch-out for IBKR: a new token cancels the old one. Long-lived tokens are possible but must be renewed. InvestIQ should show a "reconnect" reminder.

## Recommended CSV presets (7)
1. Interactive Brokers (Flex or Activity CSV). Widely used in the Gulf and the US.
2. Saxo Bank. Transaction overview > Export > Excel.
3. Trading 212. History > Export. Limited to 365 days per file, so the wizard must accept several files.
4. eToro. Account statement export (XLSX).
5. Charles Schwab. Transaction history CSV.
6. Fidelity. Activity/history CSV.
7. Generic template (date, ticker, buy/sell, quantity, price, fee, currency). This covers Gulf brokers.

Gulf brokers such as Sarwa, Derayah, Al Rajhi Capital, EFG Hermes and Bank Muscat: no public export documentation was found. They use the generic template, and we can add named presets once real user files are collected. That is an assumption, not a verified fact.

## Sources
- IBKR Flex Web Service guide: https://www.ibkrguides.com/clientportal/performanceandstatements/flex3.htm (checked 2026-09-30)
- SnapTrade pricing: https://snaptrade.com/pricing (2026-09-30)
- SnapTrade brokerage list: https://snaptrade.com/brokerage-integrations (2026-09-30, only page 1 readable)
- Trading 212 export help: https://helpcentre.trading212.com/hc/en-us/articles/360016898917 (2026-09-30)
- Saxo export steps (third-party): https://www.pocketportfolio.app/import/saxo (2026-09-30)

Not yet confirmed: SnapTrade's full brokerage list (check support.snaptrade.com/brokerages before relying on IBKR, Schwab, Fidelity, Trading 212 or Saxo coverage), and eToro's and Schwab's export formats from official pages.

## Recommendation: Ship IBKR Flex (free) plus the 7 CSV presets now, and add SnapTrade at $1 per user per month (plus $100 base) only once paying users ask for auto-sync at other brokers.

**Owner decision (2026-09-30):** approved as recommended.
