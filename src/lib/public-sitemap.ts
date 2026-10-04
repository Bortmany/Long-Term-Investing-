// What /sitemap.xml and /robots.txt say. Pure builders so they can be tested
// without a server. The sitemap lists the landing page, the two legal pages
// and exactly the stocks that pass the shared "public list + matching
// database row" rule. Never a user-derived address, never an in-app one.

import {
  publicPath,
  resolvePublicStocks,
  type PublicInstrumentSource,
} from "@/lib/public-catalogue";

export type SitemapItem = {
  url: string;
  changeFrequency: "weekly";
};

export async function buildSitemapItems(
  db: PublicInstrumentSource,
  baseUrl: string,
): Promise<SitemapItem[]> {
  const stocks = await resolvePublicStocks(db);
  return [
    { url: `${baseUrl}/`, changeFrequency: "weekly" },
    { url: `${baseUrl}/privacy`, changeFrequency: "weekly" },
    { url: `${baseUrl}/terms`, changeFrequency: "weekly" },
    ...stocks.map(({ entry }) => ({
      url: `${baseUrl}${publicPath(entry)}`,
      changeFrequency: "weekly" as const,
    })),
  ];
}

/** Signed-in areas and the API stay out of search results. */
export const ROBOTS_DISALLOW = [
  "/dashboard",
  "/portfolio",
  "/stocks",
  "/watchlist",
  "/committee",
  "/reviews",
  "/theses",
  "/settings",
  "/api/",
  "/sign-in",
  "/sign-up",
];

export function buildRobots(baseUrl: string) {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/s/"], disallow: ROBOTS_DISALLOW }],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
