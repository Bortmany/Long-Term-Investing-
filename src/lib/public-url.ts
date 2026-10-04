// The real public web address, used for canonical tags, the sitemap and
// robots.txt. It comes from BETTER_AUTH_URL, which must be the real public
// address in production (GO-LIVE.md). Falls back to localhost for local runs.

export function publicBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.BETTER_AUTH_URL?.trim() || "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}
