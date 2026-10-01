// Developer-only stand-in for Twelve Data. NOT used in production and never
// contacts the real service.
//
// What it does: answers GET /quote?symbol=...&exchange=... with the made-up
// sample replies in tests/fixtures/twelve-data/, so you can see the provider
// price badges in the app without a real key.
//
// How to use it (on your own Mac):
//   1. node scripts/fake-twelve-data.mjs            (leave it running)
//   2. in your local .env set:
//        TWELVE_DATA_API_KEY="fake-key"
//        TWELVE_DATA_BASE_URL="http://127.0.0.1:4010"
//      then restart the app. (The app ignores TWELVE_DATA_BASE_URL in
//      production, so this can never redirect the live site.)
//   3. Open a Saudi / Abu Dhabi / Qatar stock page: it shows the provider badge.
//      Stop this script: the same page shows the stored price with "Provider
//      not responding". Clear the key: back to the typed-in badge.
//
// The sample stocks it knows (symbol on exchange): 2222 on XSAU (Aramco, end
// of day), FAB on XADS, QNBK on DSMD, EMAAR on XDFM. Anything else gets the
// vendor-style "symbol not found" error inside a normal reply.
//
// The dates in the made-up files are moved to today (same time of day) so the
// badge shows a current date instead of an old one.

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(here, "..", "tests", "fixtures", "twelve-data");
const PORT = Number(process.env.PORT || 4010);

const SAMPLES = {
  "XSAU:2222": "tadawul-2222.json",
  "XADS:FAB": "adx-fab.json",
  "DSMD:QNBK": "qse-qnbk.json",
  "XDFM:EMAAR": "dfm-emaar.json",
};

function loadFixture(name) {
  return JSON.parse(readFileSync(path.join(fixtureDir, name), "utf8"));
}

/** Move the sample's date to today, keeping its time of day (UTC). */
function withTodaysDate(reply) {
  const original = new Date(reply.timestamp * 1000);
  const today = new Date();
  const moved = new Date(
    Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate(),
      original.getUTCHours(),
      original.getUTCMinutes(),
      original.getUTCSeconds(),
    ),
  );
  const day = moved.toISOString().slice(0, 10);
  const hasTime = String(reply.datetime).includes(" ");
  return {
    ...reply,
    timestamp: Math.floor(moved.getTime() / 1000),
    datetime: hasTime ? `${day} ${moved.toISOString().slice(11, 19)}` : day,
  };
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (url.pathname !== "/quote") {
    return sendJson(res, 404, { code: 404, message: "Not found", status: "error" });
  }
  // Like the real service, insist on a key — but never print or keep it.
  const auth = req.headers.authorization ?? "";
  if (!/^apikey\s+\S+/i.test(auth)) {
    return sendJson(res, 200, {
      code: 401,
      message: "API key missing (stand-in server).",
      status: "error",
    });
  }
  const symbol = (url.searchParams.get("symbol") ?? "").toUpperCase();
  const exchange = (url.searchParams.get("exchange") ?? "").toUpperCase();
  const file = SAMPLES[`${exchange}:${symbol}`];
  if (!file) {
    return sendJson(res, 200, loadFixture("error-bad-symbol.json"));
  }
  return sendJson(res, 200, withTodaysDate(loadFixture(file)));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Stand-in Twelve Data server running at http://127.0.0.1:${PORT}`);
  console.log("Made-up sample replies only. Press Ctrl+C to stop.");
});
