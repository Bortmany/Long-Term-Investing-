// Safety guard for the e2e setup: it creates a login with a known password,
// so it must only ever touch a database on this machine. Pure and free of
// side effects (no .env loading) so tests/unit can check it directly.

const LOCAL_DB_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Throws unless the database is on this machine and we're not in
 * production. Pure (reads only what it's given) so it's unit-tested.
 */
export function assertLocalTestDatabase(env: Record<string, string | undefined>): void {
  if (env.NODE_ENV === "production") {
    throw new Error("E2E setup refused: NODE_ENV is \"production\". The e2e tests only run locally.");
  }
  let host = "";
  try {
    host = new URL(env.DATABASE_URL ?? "").hostname;
  } catch {
    host = "";
  }
  if (!LOCAL_DB_HOSTS.has(host)) {
    throw new Error(
      "E2E setup refused: DATABASE_URL must point at a database on this machine " +
        "(localhost or 127.0.0.1). The e2e tests create a login with a known " +
        "password, so they never run against a shared or live database.",
    );
  }
}
