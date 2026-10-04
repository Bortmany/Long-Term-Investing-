// A pretend Interactive Brokers Flex Web Service for tests and for clicking
// through the app by hand (npm run dev:fake-ibkr). Binds to 127.0.0.1 only and
// refuses to start in production. No real account, token or network is ever
// involved.
//
// Pretend credentials:
//   token FAKE-TOKEN-OK       works (any query id)
//   token FAKE-TOKEN-EXPIRED  answers IBKR error 1012
//   token FAKE-TOKEN-SLOW     SendRequest works, the report never becomes ready (1019)
//
// Point the app at it with IBKR_FLEX_BASE_URL=http://127.0.0.1:<port>
// (honoured only outside production).

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import {
  STATEMENT_TRADES,
  flexFail,
  sendSuccess,
} from "../fixtures/ibkr-flex";

export const SEND_PATH = "/AccountManagement/FlexWebService/SendRequest";
export const GET_PATH = "/AccountManagement/FlexWebService/GetStatement";

export type FakeScenario = {
  /** The report body served by GetStatement. */
  statement?: string;
  /** Answer "still generating" (1019) this many times before the report. */
  notReadyTimes?: number;
  /** Fail SendRequest with this IBKR code. */
  sendErrorCode?: number;
  /** Fail GetStatement with this IBKR code. */
  getErrorCode?: number;
  /** Answer SendRequest with this raw body instead. */
  rawSendBody?: string;
  /** Answer GetStatement with this raw body instead. */
  rawGetBody?: string;
  /** HTTP status for every reply. */
  status?: number;
  /** Reply with a redirect to this address. */
  redirectTo?: string;
};

export type FakeIbkrServer = {
  baseUrl: string;
  port: number;
  /** Every request the server saw, as "path?query-without-token". */
  requests: { path: string; token: string | null; userAgent: string | undefined }[];
  setScenario(scenario: FakeScenario): void;
  close(): Promise<void>;
};

export async function startFakeIbkrServer(
  initial: FakeScenario = {},
  port = 0,
): Promise<FakeIbkrServer> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("The pretend IBKR server refuses to run in production.");
  }
  let scenario: FakeScenario = { ...initial };
  let notReadyLeft = scenario.notReadyTimes ?? 0;
  const requests: FakeIbkrServer["requests"] = [];

  const handler = (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const token = url.searchParams.get("t");
    requests.push({ path: url.pathname, token, userAgent: req.headers["user-agent"] });

    const send = (body: string, status = scenario.status ?? 200) => {
      res.writeHead(status, { "Content-Type": "text/xml" });
      res.end(body);
    };

    if (scenario.redirectTo) {
      res.writeHead(302, { Location: scenario.redirectTo });
      res.end();
      return;
    }

    if (url.pathname === SEND_PATH) {
      if (scenario.rawSendBody !== undefined) return send(scenario.rawSendBody);
      if (scenario.sendErrorCode) return send(flexFail(scenario.sendErrorCode));
      if (token === "FAKE-TOKEN-EXPIRED") return send(flexFail(1012, "Token has expired."));
      if (token === "FAKE-TOKEN-OK" || token === "FAKE-TOKEN-SLOW" || scenario.statement !== undefined || token?.startsWith("TESTTOKEN")) {
        return send(sendSuccess());
      }
      return send(flexFail(1015, "Token is invalid."));
    }

    if (url.pathname === GET_PATH) {
      if (scenario.rawGetBody !== undefined) return send(scenario.rawGetBody);
      if (scenario.getErrorCode) return send(flexFail(scenario.getErrorCode));
      if (token === "FAKE-TOKEN-SLOW") return send(flexFail(1019, "Statement generation in progress."));
      if (token === "FAKE-TOKEN-EXPIRED") return send(flexFail(1012, "Token has expired."));
      if (notReadyLeft > 0) {
        notReadyLeft -= 1;
        return send(flexFail(1019, "Statement generation in progress."));
      }
      return send(scenario.statement ?? STATEMENT_TRADES);
    }

    send("not found", 404);
  };

  const server: Server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  const actualPort = (server.address() as AddressInfo).port;

  return {
    baseUrl: `http://127.0.0.1:${actualPort}`,
    port: actualPort,
    requests,
    setScenario(next) {
      scenario = { ...next };
      notReadyLeft = next.notReadyTimes ?? 0;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

// Run directly (npm run dev:fake-ibkr): serve until stopped.
if (process.argv[1] && /fake-ibkr-flex-server/.test(process.argv[1])) {
  startFakeIbkrServer({}, Number(process.env.FAKE_IBKR_PORT ?? 4010)).then((server) => {
    console.log(`Pretend IBKR is running at ${server.baseUrl}`);
    console.log(`Start the app with IBKR_FLEX_BASE_URL=${server.baseUrl}`);
    console.log("Tokens: FAKE-TOKEN-OK works, FAKE-TOKEN-EXPIRED = expired, FAKE-TOKEN-SLOW = never ready.");
  });
}
