import type { MetadataRoute } from "next";

import { buildRobots } from "@/lib/public-sitemap";
import { publicBaseUrl } from "@/lib/public-url";

export default function robots(): MetadataRoute.Robots {
  return buildRobots(publicBaseUrl());
}
