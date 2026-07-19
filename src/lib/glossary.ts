// Plain-English glossary for every metric/term the app shows the owner.
// Fully static and deterministic — no AI call, no cost, no network. Every
// entry is written for someone who isn't a developer or a finance
// professional; no term inside a definition is left unexplained.
//
// Translation seam: this is a flat Record<key, {term, short, detail,
// example?}> on purpose. If the app ever adds another language, each key
// gets a second Record of the same shape (e.g. GLOSSARY_AR) — nothing about
// this shape or its call sites needs to change.

export type GlossaryKey =
  | "pe-ratio"
  | "pb-ratio"
  | "dividend-yield"
  | "roe"
  | "debt-to-equity"
  | "current-ratio"
  | "market-cap"
  | "day-change"
  | "avg-cost"
  | "market-value"
  | "unrealized-gain"
  | "total-return"
  | "weight"
  | "allocation"
  | "hhi-concentration"
  | "cash-balance"
  | "trailing-dividend-income"
  | "base-currency"
  | "fx-rate"
  | "margin-of-safety"
  | "fair-value"
  | "upside-downside"
  | "suggested-allocation"
  | "health-score"
  | "health-subscores"
  | "integrity-score"
  | "consensus-score"
  | "buy-score"
  | "sell-score"
  | "price-alert"
  | "day-drop-alert"
  | "thesis-review";

export type GlossaryEntry = {
  /** The term as a human would say it, e.g. "P/E ratio (Price to Earnings)". */
  term: string;
  /** One sentence, shown as the dialog's description. Max 160 characters. */
  short: string;
  /** 2-4 plain-English sentences. Every word in it is a word an owner already knows. */
  detail: string;
  /** Optional worked example, shown in small italic under the detail text. */
  example?: string;
};

export const GLOSSARY: Record<GlossaryKey, GlossaryEntry> = {
  "pe-ratio": {
    term: "P/E ratio (Price to Earnings)",
    short:
      "How many years of current profit it would take to earn back the share price. Lower can mean cheaper.",
    detail:
      "The price-to-earnings ratio divides the current share price by the company's earnings per share. A lower number can mean the stock is cheaper relative to its profits, while a higher number can mean investors expect faster growth. When a company has negative earnings (a loss), the ratio would be meaningless, so this app shows 'Unavailable' instead of a misleading number.",
    example: "A P/E of 15 means the stock trades at 15 times its yearly earnings per share.",
  },
  "pb-ratio": {
    term: "P/B ratio (Price to Book)",
    short:
      "Compares the share price to the company's net worth per share on its books. Below 1 can mean it's cheap.",
    detail:
      "The price-to-book ratio divides the current share price by the company's book value per share (its assets minus its liabilities, divided by shares outstanding). A ratio below 1 can suggest the market values the company at less than its recorded net worth, while a high ratio can mean investors expect strong future growth. This app shows 'Unavailable' when the book value can't be calculated, rather than guessing.",
  },
  "dividend-yield": {
    term: "Dividend yield",
    short:
      "The dividends a stock has paid over the past year, shown as a percentage of its current price.",
    detail:
      "Dividend yield tells you how much cash income a stock has recently paid out relative to what it costs today. It is calculated from the trailing 12 months of actual dividend payments, never a projection. A stock that pays no dividends shows a yield of 0%, and if the price or dividend history is missing this app shows 'Unavailable' instead of guessing.",
  },
  roe: {
    term: "ROE (Return on Equity)",
    short:
      "How much profit a company generates for every dollar shareholders have invested in it.",
    detail:
      "Return on equity divides a company's profit by its shareholders' equity (the net worth on its books). A higher ROE generally means the company is using shareholders' money efficiently to generate profit. This app calculates ROE from the company's own reported financial statements, and shows 'Unavailable' if a needed figure is missing.",
  },
  "debt-to-equity": {
    term: "Debt to equity",
    short:
      "Compares how much a company owes to how much its shareholders own, showing how reliant it is on borrowed money.",
    detail:
      "The debt-to-equity ratio divides a company's total debt by its shareholders' equity. A higher number means the company relies more on borrowed money to fund its operations, which can add risk in tough times. A lower number generally means a company is funded more by its own capital than by loans.",
  },
  "current-ratio": {
    term: "Current ratio",
    short:
      "Compares what a company can turn into cash soon to what it owes soon — its short-term financial cushion.",
    detail:
      "The current ratio divides a company's current assets (cash and things convertible to cash within a year) by its current liabilities (bills due within a year). A ratio above 1 generally means the company can cover its near-term obligations. A ratio well below 1 can be a warning sign of short-term financial strain.",
  },
  "market-cap": {
    term: "Market cap (Market Capitalization)",
    short:
      "The total value of all a company's shares combined — share price multiplied by shares outstanding.",
    detail:
      "Market capitalization is a rough measure of a company's overall size in the stock market, calculated by multiplying the current share price by the total number of shares that exist. Larger companies (a higher market cap) are often considered more stable, while smaller companies can be more volatile but may grow faster. This app never shows a market cap it can't verify from real data — it shows 'Unavailable' instead.",
  },
  "day-change": {
    term: "Day change",
    short:
      "How much a stock's price has moved since the previous trading day's close, shown as a percentage.",
    detail:
      "Day change compares today's latest price to the previous day's closing price, expressed as a percentage gain or loss. Green means the price is up today; red means it's down. If there is no previous closing price on record, this app shows the change as unavailable rather than guessing.",
  },
  "avg-cost": {
    term: "Average cost",
    short: "The average price you paid per share, across all your purchases of this holding.",
    detail:
      "Average cost is calculated purely from your own recorded transactions — every buy (and any adjustments from sells) — divided by the shares you still hold. It's not a market price; it's your personal cost basis, used to work out gains or losses. Because it comes entirely from your own transaction history, this app labels it as computed from your transactions.",
  },
  "market-value": {
    term: "Market value",
    short:
      "What your holding is worth right now — the current share price times how many shares you own.",
    detail:
      "Market value multiplies the number of shares you hold by the current price of that stock, converted into your base currency if needed. It reflects what your position could be sold for today, not what you paid for it. If a current price or exchange rate isn't available, this app says so instead of showing a made-up value.",
  },
  "unrealized-gain": {
    term: "Unrealized gain/loss",
    short:
      "The profit or loss you'd have if you sold this holding today, compared to what you paid — not yet actual cash.",
    detail:
      "Unrealized gain or loss compares a holding's current market value to your average cost for it. It's called 'unrealized' because you haven't actually sold the shares — the gain or loss only becomes real (realized) once you sell. Green means a paper profit; red means a paper loss.",
  },
  "total-return": {
    term: "Total return",
    short:
      "Your overall gain or loss on the portfolio, combining both price changes and any dividends received.",
    detail:
      "Total return adds together how much your holdings have gained or lost in price plus any dividend income you've collected along the way. This app shows it both with and without dividends included, so you can see how much of your return came from price growth versus income. It's calculated purely from your own recorded transactions and current prices.",
  },
  weight: {
    term: "Weight",
    short: "What share of your total portfolio value this one holding makes up, as a percentage.",
    detail:
      "Weight shows how much of your overall portfolio is tied up in a single holding, calculated by dividing that holding's market value by your total portfolio value. A higher weight means that stock has more influence on how your whole portfolio performs. Keeping an eye on weight helps you spot when one position has grown large enough to concentrate your risk.",
  },
  allocation: {
    term: "Allocation",
    short: "How your portfolio's value is spread across categories like sector, country, or market.",
    detail:
      "Allocation breaks down your total portfolio value into slices — for example, by industry sector, by country, or by which stock market a holding trades on. It's a way to see at a glance whether your money is concentrated in one area or spread out. Each slice's size is calculated purely from your own holdings and current market values.",
  },
  "hhi-concentration": {
    term: "Concentration (HHI)",
    short:
      "A single number showing how spread out or concentrated your portfolio is — higher means fewer holdings dominate.",
    detail:
      "This app measures concentration using the Herfindahl-Hirschman Index (HHI), a common way to measure how spread out something is. It squares each holding's weight and adds them up, so a portfolio spread evenly across many stocks scores low, while a portfolio dominated by one or two stocks scores high. It's one of the inputs used when scoring your portfolio's overall health.",
  },
  "cash-balance": {
    term: "Cash balance",
    short:
      "The uninvested cash in your portfolio, based on your deposits, withdrawals, buys, sells, and dividends.",
    detail:
      "Cash balance is never stored directly — it's worked out from every transaction you've recorded: money in, money out, what you've spent buying stocks, what you've received from selling them, and any dividends paid in cash. Because it comes entirely from your own transaction history, this app labels it 'Computed from your transactions' rather than treating it as fetched data.",
  },
  "trailing-dividend-income": {
    term: "Trailing 12-month dividend income",
    short:
      "The total dividend cash your portfolio has received over the past 12 months, across all your holdings.",
    detail:
      "This figure adds up every dividend payment recorded against your holdings over the last 12 months, converted into your base currency. It looks backward at what you've actually been paid, not a forecast of what you might receive next. Like cash balance, it's computed purely from your own transaction history.",
  },
  "base-currency": {
    term: "Base currency",
    short:
      "The single currency this app converts everything into, so your totals make sense across mixed-currency holdings.",
    detail:
      "Because you can hold stocks that trade in different currencies, this app converts every value into one base currency you choose, so your totals add up correctly. Changing your base currency doesn't move any money — it only changes which currency your figures are displayed in, using the FX rates you've stored. If a needed exchange rate is missing, affected totals say so honestly instead of guessing.",
  },
  "fx-rate": {
    term: "FX rate (exchange rate)",
    short: "How much one currency is worth in another — used to convert holdings into your base currency.",
    detail:
      "An FX rate states how many units of one currency equal one unit of another, for example how many Omani Rials one US Dollar is worth. This app uses stored FX rates to convert holdings priced in other currencies into your base currency. Rates can be fetched live, entered manually with a date, or (for demo accounts) sample data — and every rate on screen shows which of those it is.",
  },
  "margin-of-safety": {
    term: "Margin of safety",
    short:
      "How much cheaper a stock is trading than its estimated fair value, as a percentage cushion.",
    detail:
      "Margin of safety compares the current price to an AI-estimated fair value, showing the gap as a percentage. A positive margin means the stock is trading below its estimated worth, giving some cushion if the estimate turns out to be a bit optimistic. This number comes from an AI judgment, not a fetched market figure, so it always appears alongside the date that judgment was made.",
  },
  "fair-value": {
    term: "Fair value",
    short: "An AI's estimate of what a stock is really worth, based on its financials and stated assumptions.",
    detail:
      "Fair value is the AI's estimate of a stock's true worth, worked out from its financial statements and reasoning shown alongside the number. It's a judgment call, not a fact — different analysts (human or AI) can reach different fair value estimates from the same numbers. Because it's an AI opinion rather than fetched market data, it never carries a source badge; instead it shows when the analysis was run.",
  },
  "upside-downside": {
    term: "Upside / downside case",
    short:
      "The AI's estimate of how much a stock could gain in a best case, and how much it could lose in a worst case.",
    detail:
      "Upside case and downside case are the AI's estimated best-case and worst-case percentage outcomes for a stock, based on its analysis. They give you a sense of the range of plausible outcomes, not a guarantee of what will happen. Both are AI judgments generated at a point in time, not live market forecasts.",
  },
  "suggested-allocation": {
    term: "Suggested allocation",
    short:
      "The AI's suggestion for what percentage of your portfolio a new position might reasonably make up.",
    detail:
      "Suggested allocation is the AI's opinion on how large a position in this stock might reasonably be, expressed as a percentage of your total portfolio. It's meant as a starting point for your own thinking about position sizing and risk, not an instruction. This app never places trades for you — it's your decision alone.",
  },
  "health-score": {
    term: "Health score",
    short:
      "An AI's overall 0-100 rating of your portfolio's condition, combining diversification, valuation, quality, and more.",
    detail:
      "The health score is an AI's single-number judgment (0 to 100) summarizing how your portfolio looks across several dimensions — how spread out it is, how reasonably priced your holdings are, their quality, and more. It's a judgment call from an AI model, not a fetched market figure, so it always shows the date the analysis was generated and the model that produced it. Higher generally means fewer red flags, but it's meant to support your own decisions, not replace them.",
  },
  "health-subscores": {
    term: "Subscores",
    short:
      "The seven ratings — diversification, valuation, quality, concentration, dividend quality, risk, cash — behind the health score.",
    detail:
      "Each subscore rates one specific aspect of your portfolio's health on the same 0-to-100 scale as the overall score: how diversified it is, how reasonably priced your holdings look, their overall quality, how concentrated your risk is, how solid your dividend income looks, general risk level, and how much cash you're holding. Looking at the subscores can show you exactly which area is dragging the overall score down or holding it up. Like the overall score, each one is an AI judgment, not a fetched number.",
  },
  "integrity-score": {
    term: "Integrity score",
    short:
      "An AI's 0-100 rating of how well the original reasons you wrote for owning a stock still hold up today.",
    detail:
      "When you write an investment thesis, you're recording why you believe in a stock. The integrity score is the AI's judgment on how much that original reasoning still holds up given the company's latest numbers and news — a high score means the thesis still looks sound, a low score means something you counted on may have changed. It comes with supporting evidence, weakening evidence, and things that have improved, so you can see the reasoning behind the number, not just the number itself.",
  },
  "consensus-score": {
    term: "Consensus score",
    short:
      "How much the AI committee's different perspectives agree on a stock, from 0 (deep disagreement) to 100 (unanimous).",
    detail:
      "The Investment Committee asks several AI 'personas' (value, growth, dividend, quality, macro, and contrarian) to each judge a stock independently. The consensus score reflects how closely those independent judgments line up — a high score means the personas broadly agree, a low score means they see the stock very differently. Where they disagree is always shown explicitly, never hidden, because genuine disagreement is often the most useful part of the analysis.",
  },
  "buy-score": {
    term: "Buy score",
    short: "An AI's 0-100 rating of how attractive a stock looks as a new purchase right now.",
    detail:
      "The buy score is the AI's overall judgment on how compelling a stock looks as a potential purchase, considering its estimated fair value, margin of safety, and other factors it weighs. A higher score suggests the case for buying looks stronger; a lower score suggests more caution is warranted. It's an AI opinion meant to support your own research, not a recommendation to act on automatically.",
  },
  "sell-score": {
    term: "Sell score",
    short: "An AI's 0-100 rating of how strong the case looks for selling a stock you currently hold.",
    detail:
      "The sell score is the AI's overall judgment on how strong the reasons look for selling a position, based on the reasons to sell and counterarguments it lays out alongside the number. A higher score suggests the case for selling looks stronger; a lower score suggests the case looks weaker. As with every AI score in this app, it's meant to inform your own decision, not replace it.",
  },
  "price-alert": {
    term: "Price alert",
    short: "A notification that fires when a stock's price rises above, or falls below, a level you set.",
    detail:
      "A price alert watches one stock and checks whether its price has crossed a level you chose — either rising above it or falling below it. Alerts are only ever checked against real prices (live or manually entered) — this app never fires an alert based on sample demo data, even if the seeded price would technically cross your threshold.",
  },
  "day-drop-alert": {
    term: "Day-drop alert",
    short: "A notification that fires when a stock falls more than a percentage you choose in a single day.",
    detail:
      "A day-drop alert watches for a sudden move — it compares today's price to the previous day's closing price and fires if the drop is bigger than the percentage you set. It needs a previous closing price on record to work; if none exists yet, this app honestly reports the alert as 'not checked' rather than guessing at a drop percentage.",
  },
  "thesis-review": {
    term: "Thesis review reminder",
    short:
      "A recurring notification reminding you to revisit and re-check an investment thesis after a set number of days.",
    detail:
      "A thesis review reminder fires on a schedule you choose (for example, every 90 days) to nudge you to look again at a thesis and see whether the reasoning still holds up. It's a reminder to think, not an automatic re-check — running the actual check (and getting a fresh integrity score) is still something you do yourself.",
  },
};
