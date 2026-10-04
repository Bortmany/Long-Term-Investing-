import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";

import { PriceBox } from "@/components/public/price-box";
import { PublicShell } from "@/components/public/public-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { marketLabel } from "@/lib/markets";
import { prisma } from "@/lib/prisma";
import {
  findPublicEntry,
  findPublicEntryIgnoringCase,
  publicPath,
  type PublicEntry,
} from "@/lib/public-catalogue";
import { getPublicStockPageData } from "@/lib/public-stock";
import {
  aboutSentence,
  currencyLabel,
  marketParagraph,
  PUBLIC_COPY,
  pageTitle,
  researchCards,
  trackHeadline,
  typeTag,
} from "@/lib/public-stock-copy";
import { publicBaseUrl } from "@/lib/public-url";

// Public page: the same for every visitor, signed in or not. It reads NO
// cookies, headers, session or search params, so it is prepared once and
// reused for 15 minutes (a plain number, as Next.js requires). Nothing is
// prepared at build time (no database needed to build); stocks on the public
// list are made on first visit and then cached.
export const revalidate = 900;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type Params = Promise<{ market: string; ticker: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { market, ticker } = await params;
  const entry = findPublicEntry(market, ticker);
  if (!entry) return { title: "Not found | InvestIQ AI", robots: { index: false } };
  const title = pageTitle(entry);
  const description = aboutSentence(entry);
  const url = `${publicBaseUrl()}${publicPath(entry)}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: "InvestIQ AI", type: "website" },
    twitter: { card: "summary", title, description },
  };
}

function FactRows({ entry }: { entry: PublicEntry }) {
  const rows: [string, string][] = [
    ["Ticker", entry.ticker],
    ["Market", marketLabel(entry.market)],
    ["Type", typeTag(entry.type)],
    ["Sector", entry.sector],
    ["Country", entry.country],
    ["Currency", currencyLabel(entry.currency)],
  ];
  return (
    <dl className="divide-y divide-slate-100 dark:divide-slate-800">
      {rows.map(([label, value]) => (
        <div key={label} className="flex min-h-11 items-center justify-between gap-4 py-2">
          <dt className="text-sm text-slate-500 dark:text-slate-400">{label}</dt>
          <dd className="text-right text-sm font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function PublicStockPage({ params }: { params: Params }) {
  const { market, ticker } = await params;

  // 1. The public list decides first, before any database read.
  const entry = findPublicEntry(market, ticker);
  if (!entry) {
    const wrongCase = findPublicEntryIgnoringCase(market, ticker);
    if (wrongCase) permanentRedirect(publicPath(wrongCase));
    notFound();
  }

  // 2. The list + a matching database row + the price decision.
  const data = await getPublicStockPageData(prisma, entry);
  if (!data.ok) notFound();

  return (
    <PublicShell>
      <div className="flex flex-col gap-6">
        <section>
          <h1 className="font-mono text-2xl font-semibold">{entry.ticker}</h1>
          <p className="mt-1 text-lg text-slate-600 dark:text-slate-400">{entry.name}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant="secondary">{marketLabel(entry.market)}</Badge>
            <Badge variant="secondary">{typeTag(entry.type)}</Badge>
            <Badge variant="secondary">{entry.sector}</Badge>
            <Badge variant="secondary">{entry.country}</Badge>
          </div>
        </section>

        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_336px] lg:gap-12">
          {/* Phone order: price box, key facts, then the reading. Laptop:
              reading on the left, price box + facts sticky on the right. */}
          <div className="flex flex-col gap-6 lg:col-start-2 lg:row-start-1 lg:sticky lg:top-20 lg:self-start">
            <PriceBox decision={data.price} entry={entry} />
            <Card>
              <CardHeader>
                <CardTitle>{PUBLIC_COPY.keyFactsTitle}</CardTitle>
              </CardHeader>
              <CardContent>
                <FactRows entry={entry} />
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col gap-8 lg:col-start-1 lg:row-start-1">
            <section>
              <h2 className="text-lg font-semibold">About {entry.name}</h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                {aboutSentence(entry)}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                {marketParagraph(entry.market)}
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold">{PUBLIC_COPY.researchTitle}</h2>
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                {PUBLIC_COPY.researchIntro}
              </p>
              <ul className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
                {researchCards().map((card, index, all) => (
                  <li
                    key={card.key}
                    className={`rounded-lg border border-slate-200 p-4 dark:border-slate-800 ${
                      index === all.length - 1 && all.length % 2 === 1 ? "lg:col-span-2" : ""
                    }`}
                  >
                    <h3 className="text-sm font-semibold">{card.term}</h3>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{card.line}</p>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-lg border border-slate-200 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-lg font-semibold lg:text-2xl">{trackHeadline(entry)}</h2>
              {PUBLIC_COPY.trackLines.map((line) => (
                <p key={line} className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  {line}
                </p>
              ))}
              <div className="mt-4 flex flex-col gap-3 lg:flex-row">
                <Button asChild size="lg">
                  <Link href="/sign-up">{PUBLIC_COPY.trackCta}</Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="/sign-in">{PUBLIC_COPY.signIn}</Link>
                </Button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </PublicShell>
  );
}
