import type { MetadataRoute } from "next";

import { prisma } from "@/lib/prisma";
import { buildSitemapItems } from "@/lib/public-sitemap";
import { publicBaseUrl } from "@/lib/public-url";

// Read at request time (one small query), never at build time, so the build
// needs no database. No "last modified" date is invented.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildSitemapItems(prisma, publicBaseUrl());
}
