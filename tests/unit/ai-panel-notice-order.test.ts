// Which notice a person sees on an AI panel: a Free user on a Pro-only feature
// is told it is "part of Pro" even when no AI key is set; the no-key notice is
// only for someone who could actually run the feature. Plain wording for
// ordinary users; the developer hint only outside production.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AiPanel } from "@/components/ai-panel";
import { ConnectKeyNotice } from "@/components/connect-key-notice";
import { ProFeatureNotice } from "@/components/pro-feature-notice";

const stored = {
  createdAt: new Date("2026-09-01T10:00:00Z"),
  model: "claude-test-model",
  dataAsOf: new Date("2026-08-31T00:00:00Z"),
};

function render(opts: { hasKey: boolean; locked: boolean; analysis?: typeof stored | null }) {
  return renderToStaticMarkup(
    createElement(
      AiPanel,
      {
        title: "Investment Committee",
        actionLabel: "Convene Committee",
        pendingLabel: "Convening…",
        analysis: opts.analysis ?? null,
        hasKey: opts.hasKey,
        onAction: async () => ({ ok: true as const, data: null }),
        proNotice: opts.locked
          ? createElement(ProFeatureNotice, { billingEnabled: false })
          : undefined,
      },
      createElement("p", null, "STORED-RESULT-BODY"),
    ),
  );
}

afterEach(() => vi.unstubAllEnvs());

describe("AI panel notice order", () => {
  it("Free user, Pro-only feature, no key -> the Pro notice, not the no-key notice", () => {
    const html = render({ hasKey: false, locked: true });
    expect(html).toContain("This is part of Pro");
    expect(html).toContain("Pro is coming soon");
    expect(html).not.toContain("AI features are turned off");
  });

  it("Pro user (or non-Pro feature), no key -> the no-key notice", () => {
    const html = render({ hasKey: false, locked: false });
    expect(html).toContain("AI features are turned off");
    expect(html).not.toContain("This is part of Pro");
  });

  it("Free user with a stored result and no key still sees the result and the Pro notice", () => {
    const html = render({ hasKey: false, locked: true, analysis: stored });
    expect(html).toContain("STORED-RESULT-BODY");
    expect(html).toContain("This is part of Pro");
  });
});

describe("no-key wording", () => {
  it("in production shows plain wording and no environment-variable name", () => {
    vi.stubEnv("NODE_ENV", "production");
    const html = renderToStaticMarkup(createElement(ConnectKeyNotice));
    expect(html).toContain("AI analysis isn&#x27;t switched on for this site yet.");
    expect(html).not.toContain("ANTHROPIC_API_KEY");
  });

  it("in development keeps the developer hint", () => {
    vi.stubEnv("NODE_ENV", "development");
    const html = renderToStaticMarkup(createElement(ConnectKeyNotice));
    expect(html).toContain("ANTHROPIC_API_KEY");
  });
});
