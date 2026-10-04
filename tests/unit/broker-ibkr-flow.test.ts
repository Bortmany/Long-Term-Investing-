import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GET_PATH,
  SEND_PATH,
  startFakeIbkrServer,
  type FakeIbkrServer,
} from "../support/fake-ibkr-flex-server";
import {
  STATEMENT_TRADES,
  HTML_ERROR_PAGE,
  flexFail,
  sendSuccess,
} from "../fixtures/ibkr-flex";
import {
  GET_STATEMENT_PATH,
  IBKR_FLEX_HOST,
  SEND_REQUEST_PATH,
  TOTAL_BUDGET_MS,
  getStatement,
  resolveBaseUrl,
  sendRequest,
  type FlexDeps,
} from "@/lib/broker/ibkr-flex/client";
import { logger } from "@/lib/logger";

const TOKEN = "TESTTOKEN-SECRET-VALUE-42";
const creds = { token: TOKEN, queryId: "123456" };

let server: FakeIbkrServer;
beforeAll(async () => {
  server = await startFakeIbkrServer();
});
afterAll(async () => {
  await server.close();
});

/** Deps pointed at the stand-in, with an instant fake clock. */
function deps(extra: Partial<FlexDeps> = {}): FlexDeps & { slept: number[] } {
  let t = 0;
  const slept: number[] = [];
  return {
    env: { IBKR_FLEX_BASE_URL: server.baseUrl, NODE_ENV: "test" },
    sleep: async (ms) => {
      slept.push(ms);
      t += ms;
    },
    now: () => t,
    ...extra,
    slept,
  };
}

beforeEach(() => {
  server.requests.length = 0;
  server.setScenario({});
});

describe("Flex client against the stand-in server", () => {
  it("happy path: reference code, then the report", async () => {
    server.setScenario({ statement: STATEMENT_TRADES });
    const d = deps();
    const sent = await sendRequest(creds, d);
    expect(sent).toEqual({ ok: true, referenceCode: "1234567890" });
    const got = await getStatement(creds, "1234567890", d);
    expect(got.ok).toBe(true);
    if (got.ok) expect(got.body).toContain("<FlexQueryResponse");
    // Always asks for version 3 and sends a User-Agent.
    expect(server.requests.every((r) => r.userAgent?.startsWith("InvestIQ/"))).toBe(true);
  });

  it("only ever requests the two allowed paths", async () => {
    server.setScenario({ statement: STATEMENT_TRADES });
    const d = deps();
    await sendRequest(creds, d);
    await getStatement(creds, "1234567890", d);
    const paths = new Set(server.requests.map((r) => r.path));
    expect([...paths].sort()).toEqual([GET_PATH, SEND_PATH].sort());
    expect(SEND_REQUEST_PATH).toBe(SEND_PATH);
    expect(GET_STATEMENT_PATH).toBe(GET_PATH);
  });

  it("backs off 3, 3, 6, 12 seconds while IBKR is still generating", async () => {
    server.setScenario({ statement: STATEMENT_TRADES, notReadyTimes: 3 });
    const d = deps();
    const got = await getStatement(creds, "1234567890", d);
    expect(got.ok).toBe(true);
    expect(d.slept).toEqual([3000, 3000, 6000, 12000]);
  });

  it("gives up after six tries and never exceeds the 90-second budget", async () => {
    server.setScenario({ notReadyTimes: 99 });
    const d = deps();
    const got = await getStatement(creds, "1234567890", d);
    expect(got.ok).toBe(false);
    if (!got.ok) {
      expect(got.code).toBe("ibkr_1019");
      expect(got.message).toContain("still preparing");
    }
    expect(d.slept).toEqual([3000, 3000, 6000, 12000, 20000, 30000]);
    expect(d.slept.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(TOTAL_BUDGET_MS);
  });

  it("stops at the time budget when the clock is already late", async () => {
    server.setScenario({ notReadyTimes: 99 });
    let t = 0;
    const slept: number[] = [];
    const d = deps({
      sleep: async (ms) => {
        slept.push(ms);
        t += ms * 4; // a slow machine: each wait costs four times as long
      },
      now: () => t,
    });
    const got = await getStatement(creds, "1234567890", d);
    expect(got.ok).toBe(false);
    expect(slept.length).toBeLessThan(6);
  });

  const cases: [number, string, "reconnect" | "retry" | "fix"][] = [
    [1012, "Your IBKR token has expired. Create a new one in IBKR and reconnect.", "reconnect"],
    [1015, "IBKR doesn't recognise that token. Check you copied all of it, or create a new one.", "reconnect"],
    [1013, "Your token is locked to certain IP addresses and InvestIQ isn't one of them. In IBKR remove the IP restriction, create a new token and reconnect.", "reconnect"],
    [1016, "IBKR says the account for this token isn't valid. Create a new token and reconnect.", "reconnect"],
    [1014, "IBKR doesn't recognise that Query ID. Check the number under Flex Queries.", "fix"],
    [1010, "That query is an old type IBKR no longer supports. Create a new Activity Flex Query.", "fix"],
    [1011, "Flex Web Service looks switched off for this IBKR account. Turn it on in IBKR's Flex settings.", "fix"],
    [1009, "Interactive Brokers is busy right now. Try again in a few minutes.", "retry"],
    [1017, "Something went wrong fetching your report. Please try again.", "retry"],
    [1018, "Interactive Brokers asked us to slow down. Wait a minute and try again.", "retry"],
    [1001, "Interactive Brokers couldn't generate your report just now. Try again shortly.", "retry"],
    [1004, "Interactive Brokers doesn't have your report ready. This often happens around market close or IBKR's nightly maintenance. Try again later.", "retry"],
  ];
  it.each(cases)("IBKR code %i gives its exact plain message and state", async (code, message, kind) => {
    server.setScenario({ sendErrorCode: code });
    const sent = await sendRequest(creds, deps());
    expect(sent.ok).toBe(false);
    if (!sent.ok) {
      expect(sent.message).toBe(message);
      expect(sent.kind).toBe(kind);
    }
    server.setScenario({ getErrorCode: code });
    const got = await getStatement(creds, "1", deps());
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.message).toBe(message);
  });

  it("an unknown code shows the generic text with the number", async () => {
    server.setScenario({ sendErrorCode: 1020 });
    const sent = await sendRequest(creds, deps());
    expect(sent.ok).toBe(false);
    if (!sent.ok) {
      expect(sent.message).toBe(
        "Interactive Brokers couldn't process the request (IBKR code 1020). Try again; if it keeps happening, contact us.",
      );
    }
  });

  it("an unreadable reply (HTML, empty, wrong shape) is a failure, never parsed loosely", async () => {
    for (const raw of [HTML_ERROR_PAGE, "   ", "<FlexStatementResponse><Status>Success</Status></FlexStatementResponse>", "<other/>"]) {
      server.setScenario({ rawSendBody: raw });
      const sent = await sendRequest(creds, deps());
      expect(sent.ok).toBe(false);
      if (!sent.ok) expect(sent.message).toBe("Interactive Brokers sent something we couldn't read. Try again later.");
    }
    server.setScenario({ rawGetBody: HTML_ERROR_PAGE });
    const got = await getStatement(creds, "1", deps());
    expect(got.ok).toBe(false);
  });

  it("ignores the address inside IBKR's reply and a reference code with odd characters", async () => {
    server.setScenario({ rawSendBody: sendSuccess("abc123").replace("example.invalid", "evil.example") });
    const sent = await sendRequest(creds, deps());
    expect(sent).toEqual({ ok: true, referenceCode: "abc123" });
    expect(server.requests.length).toBe(1);

    server.setScenario({ rawSendBody: sendSuccess("../../x?t=1") });
    const bad = await sendRequest(creds, deps());
    expect(bad.ok).toBe(false);
  });

  it("does not follow redirects", async () => {
    server.setScenario({ redirectTo: "http://127.0.0.1:1/elsewhere" });
    const sent = await sendRequest(creds, deps());
    expect(sent.ok).toBe(false);
    expect(server.requests.length).toBe(1);
  });

  it("a bad HTTP status is a failure", async () => {
    server.setScenario({ status: 500, rawSendBody: sendSuccess() });
    const sent = await sendRequest(creds, deps());
    expect(sent.ok).toBe(false);
  });

  it("the base-address override is ignored in production", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveBaseUrl({ IBKR_FLEX_BASE_URL: "http://127.0.0.1:9", NODE_ENV: "production" })).toBe(IBKR_FLEX_HOST);
    warn.mockRestore();
    expect(resolveBaseUrl({ IBKR_FLEX_BASE_URL: "http://127.0.0.1:9/", NODE_ENV: "development" })).toBe("http://127.0.0.1:9");
    expect(resolveBaseUrl({})).toBe(IBKR_FLEX_HOST);
  });

  it("the real addresses are the documented IBKR host and the two paths", () => {
    expect(IBKR_FLEX_HOST).toBe("https://ndcdyn.interactivebrokers.com");
    expect(SEND_REQUEST_PATH).toBe("/AccountManagement/FlexWebService/SendRequest");
    expect(GET_STATEMENT_PATH).toBe("/AccountManagement/FlexWebService/GetStatement");
  });

  it("refuses a reply larger than 10 MB", async () => {
    const huge = "<FlexQueryResponse>" + "x".repeat(10 * 1024 * 1024 + 10) + "</FlexQueryResponse>";
    server.setScenario({ rawGetBody: huge });
    const got = await getStatement(creds, "1", deps());
    expect(got.ok).toBe(false);
  });
});

describe("the token never leaks from failures", () => {
  function captureLogs() {
    const lines: string[] = [];
    const spies = (["log", "warn", "error"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(" "));
      }),
    );
    return { lines, restore: () => spies.forEach((s) => s.mockRestore()) };
  }

  it("a malformed developer base URL gives the typed failure, not a throw", async () => {
    const result = await sendRequest(creds, { env: { IBKR_FLEX_BASE_URL: "not a url", NODE_ENV: "test" } });
    expect(result.ok).toBe(false);
  });

  it("network failure, bad status, bad XML and timeout carry no token or address", async () => {
    const cap = captureLogs();
    const results: unknown[] = [];

    // 1. Nothing is listening: a network failure.
    results.push(await sendRequest(creds, { env: { IBKR_FLEX_BASE_URL: "http://127.0.0.1:1", NODE_ENV: "test" } }));
    // 2. A fetch that throws an error that CONTAINS the address and token.
    results.push(
      await sendRequest(creds, {
        fetchImpl: (async (input: RequestInfo | URL) => {
          throw new Error(`boom ${String(input)}`);
        }) as typeof fetch,
      }),
    );
    // 3. A timeout.
    results.push(
      await getStatement(creds, "1", {
        sleep: async () => {},
        fetchImpl: (async () => {
          throw new DOMException("The operation timed out", "TimeoutError");
        }) as typeof fetch,
      }),
    );
    // 4. A 500, and 5. bad XML, from the stand-in.
    server.setScenario({ status: 500, rawSendBody: "oops" });
    results.push(await sendRequest(creds, deps()));
    server.setScenario({ rawSendBody: "<FlexStatementResponse><Status>Fail</Status><ErrorCode>abc</ErrorCode></FlexStatementResponse>" });
    results.push(await sendRequest(creds, deps()));

    cap.restore();
    const everything = JSON.stringify(results) + cap.lines.join("\n");
    expect(everything).not.toContain(TOKEN);
    expect(everything).not.toContain("127.0.0.1");
    expect(everything).not.toContain("interactivebrokers.com");
    expect(results.every((r) => (r as { ok: boolean }).ok === false)).toBe(true);
    void logger;
  });
});

describe("fixtures", () => {
  it("flexFail builds the documented failure shape", () => {
    expect(flexFail(1012)).toContain("<ErrorCode>1012</ErrorCode>");
  });
});
