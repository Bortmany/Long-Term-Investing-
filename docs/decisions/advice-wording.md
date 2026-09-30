# Decision 1.4: How the app words its AI advice

*Research, not legal advice. Written 2026-09-30.*

**Why.** Each country's rules turn on the same question: is the app giving advice fitted to one person's own money, for payment?

- **US:** in 1985 the Supreme Court (Lowe v. SEC) said a publication does not need an adviser licence if it is impersonal, bona fide, and circulated generally and regularly. In 2024 a court applied this to Seeking Alpha: its stock ratings were the same for everyone, and users could only filter them.
- **Oman:** the new securities rules (FSA Decision E/11/2026) list "research and advisory services related to investment in listed securities" as licensed work.
- **Saudi Arabia:** the CMA requires a licence for "Advising". It has reportedly fined an unlicensed adviser who gave paid advice on social media.

Higher risk: a percentage of *your* portfolio, or "sell *your* holding", paid for through Pro. Lower risk: a fair-value estimate that is the same for every user.

## 1. Wording changes

| Today (where) | Change to |
|---|---|
| BUY / HOLD / SELL chip (verdict-chip.tsx, schemas.ts) | "Committee view: Positive / Neutral / Negative". Stored values stay as they are. |
| "Suggested position size: X% of the portfolio" (buy-analysis-panel.tsx); `suggestedAllocationPct`; glossary "Suggested allocation" (glossary.ts); AI instruction in committee.ts | **Remove.** Optionally show a fact instead: "This holding is X% of your portfolio today." |
| "Fair Value" (buy-analysis-panel.tsx) | Keep, relabelled "AI fair-value estimate", with assumptions and date shown. |
| "Buy Analysis" / "Buy Score" | "Upside check" / "Opportunity score" |
| "Sell Analysis" / "Sell Score" / "Reasons to Sell" | "Downside check" / "Warning-signs score" / "Reasons for concern" |
| "Alternatives" (buy-analysis-panel.tsx) | "Similar companies to compare" |
| "Recommendations" headings (health-score-content.tsx, stock-score-panel.tsx) | "Points to consider" |
| "Suggested Actions" (reviews/[id]/page.tsx; AI instruction in reviews/snapshot.ts) | "Questions to ask yourself" — ask the AI for questions, not actions. |
| Home page: "Before a buy or sell, an AI committee… votes" (page.tsx) | "Before you decide, six AI analysts review the same data and each gives its view" |
| AI instructions: "decision about their own portfolio"; "your own recommendation (BUY, HOLD, or SELL)" (prompts.ts) | "research this company"; "your view (POSITIVE, NEUTRAL, NEGATIVE)" |
| Thesis check labels Intact / Weakening / Broken | Keep |

## 2. Disclaimer text

**On every AI panel** (replaces today's fixed line; `docs/CONVENTIONS.md` must be updated with it): "AI-generated research for education only, not a personal recommendation. It doesn't know your full finances and can be wrong. InvestIQ is not licensed to give investment advice in Oman, Saudi Arabia, the US or elsewhere."

**Terms page, added to "Not financial advice":** "Nothing in InvestIQ is tailored to your personal circumstances or goals. We don't manage money or place trades. Consider speaking to a licensed adviser before acting."

## 3. For a lawyer to confirm

1. Does Oman's securities law and its new rules (E/11/2026) apply to an app run from Oman? Is there any exemption for publications or software? The rules reportedly took effect on 27 July 2026, with compliance reportedly due by 27 January 2027.
2. Saudi: does the newspaper/broadcast exemption (reportedly Article 15) cover a paid app?
3. US: do committee views produced on request, using the user's own holdings, still count as impersonal publications? Or should the app stop sending a user's holdings to the AI for stock views?
4. Do individual US states have rules we also need to follow?
5. Should the app refuse to comment on a user's specific holding at all, or is reworded language enough?

Estimated cost: about 2 hours each of a Gulf and a US lawyer, roughly US$2,000–8,000 in total (researcher's estimate, no published fee found).

Confidence notes: the Oman dates, the Saudi Article 15 exemption and the Saudi fine come from search-result summaries, not the original documents; the full Oman law text needs a subscription.

## Sources (all checked 2026-09-30)
- Lowe v. SEC, 472 U.S. 181 (1985): https://supreme.justia.com/cases/federal/us/472/181/
- Katten, Lingley v. Seeking Alpha (15 Aug 2024): https://katten.com/judge-dismisses-case-against-seeking-alpha-implications-for-publishers-of-financial-information
- National Law Review, "Navigating the Publisher's Exclusion" (3 Dec 2025): https://natlawreview.com/article/navigating-publishers-exclusion-under-advisers-act
- SEC robo-adviser guidance (23 Feb 2017): https://www.sec.gov/newsroom/press-releases/2017-52
- SEC withdraws proposed AI/data rule (12 Jun 2025): https://www.sec.gov/rules-regulations/2025/06/s7-12-23
- Oman Observer (17 Aug 2026): https://www.omanobserver.om/article/1194626/business/economy/oman-regulates-investment-banking-activities
- Oman Securities Law, Royal Decree 46/2022: https://decree.om/2022/rd20220046/
- Saudi CMA Securities Business Regulations: https://cma.gov.sa/en/RulesRegulations/Regulations/Documents/Amended%20Securities%20Business%20Regulations.pdf
- Zawya, Saudi CMA fine: https://www.zawya.com/en/capital-markets/equities/saudi-cma-imposes-fine-on-unlicensed-investment-advisor-olbh72pj

## Recommendation: Remove "suggested % of your portfolio", reword Buy/Sell/Recommendation labels as above, keep stock-level views identical for every user, and get a lawyer's sign-off before the paid Pro plan opens.

**Owner decision (2026-09-30):** approved as recommended.
