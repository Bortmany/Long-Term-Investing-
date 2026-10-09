// Every sentence on the public stock page, in one file, so one test can scan
// them all for words we never use (Buy, Sell, Hold, "should", and so on) and
// so a later translation touches one place. English only (owner's decision).
//
// No numbers, no claims about size or performance anywhere in here.

import type { Market } from "@prisma/client";

import { GLOSSARY, type GlossaryKey } from "@/lib/glossary";
import { marketLabel } from "@/lib/markets";
import type { PublicEntry } from "@/lib/public-catalogue";

/** The not-advice line (decision 1.4). If Step 6 finalises other wording in the Terms, change it here only. */
export const PUBLIC_NOT_ADVICE_LINE =
  "General information for education only, not a personal recommendation. InvestIQ is not licensed to give investment advice.";

export const PUBLIC_POSITIONING_LINE =
  "Portfolio tracking and research software, not personalised advice.";

export const PUBLIC_COPY = {
  signInToSeePrices: "Sign in to see prices",
  priceBoxTitle: "Prices are shown to signed-in members",
  priceBoxLine:
    "Sign in to see this stock's price with its source. Free accounts are welcome.",
  createAccountLink: "New here? Create a free account",
  latestPriceTitle: "Latest price",
  priceDisclaimer: "Prices may be delayed and are for information only.",
  signInToTrack: "Sign in to track this stock.",
  signIn: "Sign in",
  trackCta: "Track this in InvestIQ",
  trackLines: [
    "Record your holdings, see your gains and dividends in one place, and add your own notes and price alerts.",
    "Free to start. No card needed.",
  ],
  keyFactsTitle: "Key facts",
  researchTitle: "How people research a company",
  researchIntro:
    "These are common terms you will meet when reading about any company. No figures for this company are shown here.",
  notFoundHeading: "Nothing here",
  notFoundLine:
    "We couldn't find a page at this address. Check the link, or start from the home page.",
  goHome: "Go to the home page",
} as const;

/** Glossary keys used by the explainer cards (neutral terms only). */
export const PUBLIC_GLOSSARY_KEYS: readonly GlossaryKey[] = [
  "pe-ratio",
  "pb-ratio",
  "dividend-yield",
  "roe",
  "market-cap",
];

// P/E and P/B `short` lines carry a second, value-leaning sentence ("Lower can
// mean cheaper"). Step 6 owns the glossary wording, so until it is reworded
// the public page shows only the first sentence of every line.
export function firstSentence(text: string): string {
  const index = text.indexOf(". ");
  return index === -1 ? text : text.slice(0, index + 1);
}

export function researchCards(): { key: GlossaryKey; term: string; line: string }[] {
  return PUBLIC_GLOSSARY_KEYS.map((key) => ({
    key,
    term: GLOSSARY[key].term,
    line: firstSentence(GLOSSARY[key].short),
  }));
}

const TYPE_WORD = { STOCK: "stock", ETF: "ETF", REIT: "REIT" } as const;
const TYPE_TAG = { STOCK: "Stock", ETF: "ETF", REIT: "REIT" } as const;

export function typeTag(type: PublicEntry["type"]): string {
  return TYPE_TAG[type];
}

const CURRENCY_NAME: Record<string, string> = {
  USD: "US dollar",
  OMR: "Omani rial",
  SAR: "Saudi riyal",
  AED: "UAE dirham",
  QAR: "Qatari riyal",
};

export function currencyLabel(code: string): string {
  const name = CURRENCY_NAME[code];
  return name ? `${code} (${name})` : code;
}

const MARKET_PARAGRAPH: Record<Market, string> = {
  US: "The United States has several stock exchanges, including the New York Stock Exchange and Nasdaq. Companies listed there are quoted in US dollars.",
  MSX: "The Muscat Stock Exchange (MSX) is the stock exchange of Oman, based in Muscat. Companies listed there are quoted in Omani rials.",
  TADAWUL:
    "Tadawul, the Saudi Exchange, is the main stock exchange of Saudi Arabia, based in Riyadh. Companies listed there are quoted in Saudi riyals.",
  DFM: "The Dubai Financial Market (DFM) is a stock exchange in Dubai, in the United Arab Emirates. Companies listed there are quoted in UAE dirhams.",
  ADX: "The Abu Dhabi Securities Exchange (ADX) is the stock exchange of Abu Dhabi, in the United Arab Emirates. Companies listed there are quoted in UAE dirhams.",
  QSE: "The Qatar Stock Exchange (QSE) is the stock exchange of Qatar, based in Doha. Companies listed there are quoted in Qatari riyals.",
  OTHER: "This stock is listed on an exchange outside InvestIQ's main markets.",
};

export function marketParagraph(market: Market): string {
  return MARKET_PARAGRAPH[market];
}

/** The one factual "About" sentence, built only from the public list. */
export function aboutSentence(entry: PublicEntry): string {
  return `${entry.name} is a ${TYPE_WORD[entry.type]} listed on ${marketLabel(entry.market)}, in the ${entry.sector} sector, based in ${entry.country}. Prices are quoted in ${entry.currency}.`;
}

export function pageTitle(entry: PublicEntry): string {
  return `${entry.name} (${entry.ticker}) — ${marketLabel(entry.market)} | InvestIQ AI`;
}

export function trackHeadline(entry: PublicEntry): string {
  return `Keep track of ${entry.name} in InvestIQ`;
}

/** Every string a visitor can read on a public stock page (used by the word scan). */
export function allPublicSentences(entry: PublicEntry): string[] {
  const copy = PUBLIC_COPY;
  return [
    copy.signInToSeePrices,
    copy.priceBoxTitle,
    copy.priceBoxLine,
    copy.createAccountLink,
    copy.latestPriceTitle,
    copy.priceDisclaimer,
    copy.signInToTrack,
    copy.signIn,
    copy.trackCta,
    ...copy.trackLines,
    copy.keyFactsTitle,
    copy.researchTitle,
    copy.researchIntro,
    copy.notFoundHeading,
    copy.notFoundLine,
    copy.goHome,
    PUBLIC_POSITIONING_LINE,
    aboutSentence(entry),
    marketParagraph(entry.market),
    trackHeadline(entry),
    pageTitle(entry),
    ...researchCards().flatMap((card) => [card.term, card.line]),
  ];
}
