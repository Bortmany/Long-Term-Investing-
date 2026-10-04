# Decision 1.3: Sharia screen badge

Status: proposed, 2026-09-30

## What we are adding
An optional badge on each stock, off by default: Compliant, Not compliant, or Not screened. One tap shows the method, the source and the date it was last checked.

## Method and thresholds
Screens like this have two steps.
1. Business activity. Companies whose main business is banking or insurance that charges interest, alcohol, pork, tobacco, gambling or adult content fail outright. Media and defence get a size test instead.
2. Financial ratios. AAOIFI (Standard 21) sets these limits:
   - Interest-bearing debt: under 30% of market value.
   - Cash and interest-bearing deposits: under 30% of market value.
   - Non-permitted income: under 5% of total income.

Other methods differ mainly in what the debt limit is measured against:
- Dow Jones Islamic and S&P Shariah use about 33% of average market value (24 and 36 months).
- MSCI Islamic uses 33% of total assets.
- Sources disagree on some of these details. Check them against the vendor's rulebook before we print any of them in the app.

The same company can pass one method and fail another.

## Options compared
- Build it ourselves.
  - Our financial data covers US stocks reasonably, but Gulf data is sparse.
  - It does not give reliable income splits by activity. That is what the 5% test and the business screen need.
  - We would also have to take on scholar oversight ourselves.
  - Any guess would break our rule against made-up results.
- Buy verdicts.
  - Musaffa: 120,000+ stocks on 70+ exchanges, including Saudi (Tadawul). Its Pro plan covers three markets and has 100,000 calls a month. The Starter plan excludes the US. The price is not published.
  - Zoya: 60,000+ stocks and funds, AAOIFI-based, with a free test sandbox. Commercial plans are $399/month (Basic) and $1,399/month (Advanced). Its Gulf coverage is not confirmed.
  - Halal Terminal ($29/month) and Finispia are smaller. IdealRatings and Islamicly published no prices we could find.

## Data source, cost, licence
Musaffa API, Pro plan, with the three markets US, Saudi and UAE. Before signing we need a written quote and written permission to show verdicts to our users in the app. Neither vendor's public pages state display terms.

## Unknown
"Not screened" appears whenever the vendor has no verdict, the data is older than 100 days, or the stock is on an uncovered exchange. We never fill a gap or carry over an old verdict.

## Refresh
Pull daily. Ratios change with each quarterly report and with share price. Show "Checked on <date>" in the detail view.

## Wording (shown in the detail view)
"Screen per AAOIFI-based method, supplied by Musaffa, checked <date>. This is an automated screen, not a religious ruling (fatwa). Different scholars and methods can reach different results. Ask a qualified scholar if unsure."

## Recommendation: Buy verdicts from Musaffa (Pro plan) and show "Not screened" when there is no verdict; do not build our own screen.

Still open: Musaffa's price, Zoya's Gulf coverage and permission to display verdicts are unconfirmed. Both vendors need an email before we commit.

## Sources (all accessed 2026-09-30)
- https://zoya.finance/api
- https://musaffa.com/for-business/
- https://faithscreener.com/blog/aaoifi-standard-21-explained
- https://www.halalterminal.com/blog/posts/best-islamic-finance-apis-2026
- https://academy.musaffa.com/halal-stocks-in-tasi-saudi-arabia/

**Owner decision (2026-09-30):** approved as recommended.
