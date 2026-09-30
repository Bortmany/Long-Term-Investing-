# Decision 1.5: who takes InvestIQ's USD subscription payments (checked 30 Sep 2026)

**Existing decision?** None. `~/claude/Agents/docs/decisions/` was empty. Cut, TradeOS and Tielora already have Paddle built in, but that choice was never checked against financial products (Tielora's go-live notes say Paddle's acceptance of Oman sellers came from search results, not Paddle's own pages).

**The deciding fact.** InvestIQ gives BUY/HOLD/SELL verdicts on stocks. Most "merchant of record" services (companies that sell on your behalf and handle worldwide sales tax) ban investment advice outright, with no exception process. That rules out the easy options, even the ones that accept a seller living in Oman.

| Provider | Accepts an Oman resident? How money reaches you | Fees | Handles tax? | Subscriptions + customer self-service | Allows InvestIQ? |
|---|---|---|---|---|---|
| **Paddle** | Yes. Bank wire, PayPal or Payoneer, monthly (min $100) | 5% + 50¢ | Yes | Yes. Sandbox, signed webhooks | **No.** Bans "investment or financial advice, including trading signals and strategies" |
| **Polar** | Yes. Paid out via Stripe to Oman | 5% + 50¢ (+1.5% non-US cards), payout fees | Yes | Yes | **No.** Bans "investment advisory services (including insights platforms)" |
| **Dodo Payments** | Not checked | — | Yes | Yes | **No.** Bans "investment strategies" and "unlicensed financial tools" |
| **Lemon Squeezy** | Yes. Bank or PayPal | 5% + 50¢ | Yes | Yes, test mode | Not named in its ban list, but the service is winding down (Jan 2026) and moving users to Stripe |
| **Gumroad / FastSpring / 2Checkout** | Not confirmed for Oman | Gumroad 10% + 50¢; FastSpring ~5.9% + 95¢ plus $150 review fee (third-party figures) | Yes | Gumroad weak; FastSpring needs a sales call | Not confirmed |
| **Stripe, via a US company from Atlas** | Not directly. Stripe pays a US account (Stripe's or Mercury), then you wire to Oman | 2.9% + 30¢, +0.7% subscriptions, +3.5% Managed Payments, +1.5% non-US cards (≈7.1% + 30¢; ≈8.6% + 30¢ non-US) | Yes, with Managed Payments (Stripe is the seller) | Yes. Link customer site, test mode, signed webhooks | **Likely.** Only "investment and brokerage services" need approval; InvestIQ is analysis software, not a broker |

**What the Stripe route costs**
- Setup: $500 once through Atlas (Delaware company, US tax number, first year of registered agent). Refunded if Atlas can't support you.
- Every year: $100 registered agent + $300 Delaware franchise tax (due 1 June).
- US tax return by an accountant: roughly $300–800 a year (estimate, not checked).
- Omani tax on earnings still applies — ask a local accountant.
- **Not confirmed:** whether Atlas accepts someone living in Oman. Confirm at sign-up.

**Other apps.** The same US company can later serve Cut, TradeOS and Trip Share Pay. TradeOS may break the same Paddle rule (trading-related) — check before applying to Paddle. Trip Share Pay only clashes with Paddle's payment-services ban if the app itself moves money. Cut and Tielora are unaffected.

**Refund line for the terms:** "You can cancel Pro at any time from Manage billing and keep Pro until the end of the period you paid for; if you're not satisfied, ask within 14 days of any payment for a full refund of that payment. Payments are handled by Stripe (shown as 'Link') as our reseller, which may also issue refunds where the law requires."

## Recommendation: Form a US company through Stripe Atlas and take InvestIQ's payments through Stripe Managed Payments, describing InvestIQ everywhere as "portfolio tracking and research software, not personalised advice".

## Sources (all read 30 Sep 2026)
- https://www.paddle.com/help/start/intro-to-paddle/which-countries-are-supported-by-paddle
- https://www.paddle.com/help/start/intro-to-paddle/what-am-i-not-allowed-to-sell-on-paddle
- https://www.paddle.com/help/manage/get-paid/when-and-how-do-i-get-paid
- https://polar.sh/docs/merchant-of-record/acceptable-use
- https://polar.sh/docs/merchant-of-record/fees
- https://polar.sh/docs/merchant-of-record/supported-countries
- https://docs.lemonsqueezy.com/help/getting-started/supported-countries
- https://docs.lemonsqueezy.com/help/getting-started/prohibited-products
- https://www.lemonsqueezy.com/blog/2026-update
- https://docs.dodopayments.com/miscellaneous/merchant-acceptance
- https://stripe.com/legal/restricted-businesses
- https://docs.stripe.com/payments/managed-payments/eligibility
- https://docs.stripe.com/payments/managed-payments/how-it-works
- https://support.stripe.com/questions/managed-payments-pricing
- https://stripe.com/pricing
- https://docs.stripe.com/atlas/signup
- https://docs.stripe.com/atlas/business-taxes
- FastSpring and Gumroad fees: third-party reviews (dodopayments.com, cartmango.com) — rough.
