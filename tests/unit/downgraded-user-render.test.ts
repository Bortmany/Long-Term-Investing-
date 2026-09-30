// A Free (downgraded) user who still has a saved Pro result keeps seeing it.
// Downgrading only takes away the generate button: the stored analysis, its
// caption and the AiDisclaimer stay exactly as before, and the Pro notice
// sits where the button was. There is never a placeholder that looks like data.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AiPanel } from "@/components/ai-panel";
import { ProFeatureNotice } from "@/components/pro-feature-notice";

const DISCLAIMER = "This is analysis to support your own decision, not financial advice.";
const stored = {
  createdAt: new Date("2026-09-01T10:00:00Z"),
  model: "claude-test-model",
  dataAsOf: new Date("2026-08-31T00:00:00Z"),
};

function render(opts: { analysis: typeof stored | null; locked: boolean }) {
  return renderToStaticMarkup(
    createElement(
      AiPanel,
      {
        title: "Investment Committee",
        actionLabel: "Convene Committee",
        pendingLabel: "Convening…",
        analysis: opts.analysis,
        hasKey: true,
        onAction: async () => ({ ok: true as const, data: null }),
        proNotice: opts.locked
          ? createElement(ProFeatureNotice, { billingEnabled: false })
          : undefined,
      },
      createElement("p", null, "STORED-RESULT-BODY"),
    ),
  );
}

describe("a downgraded Free user with a stored Pro result", () => {
  const html = render({ analysis: stored, locked: true });

  it("still sees the stored content", () => {
    expect(html).toContain("STORED-RESULT-BODY");
  });

  it("still sees the usual caption and the AiDisclaimer", () => {
    expect(html).toContain("Analysis from");
    expect(html).toContain("claude-test-model");
    expect(html).toContain("based");
    expect(html).toContain(DISCLAIMER);
  });

  it("sees the Pro notice instead of the generate button", () => {
    expect(html).toContain("This is part of Pro");
    expect(html).not.toContain("Convene Committee");
    expect(html).not.toContain("<button");
  });

  it("matches what a Pro user sees, apart from the button and the notice", () => {
    const pro = render({ analysis: stored, locked: false });
    expect(pro).toContain("STORED-RESULT-BODY");
    expect(pro).toContain("Convene Committee");
    expect(pro).toContain(DISCLAIMER);
  });
});

describe("a Free user with nothing stored", () => {
  it("gets the Pro notice only, with no fake result and no 'No analysis yet' placeholder", () => {
    const html = render({ analysis: null, locked: true });
    expect(html).toContain("This is part of Pro");
    expect(html).not.toContain("STORED-RESULT-BODY");
    expect(html).not.toContain("Analysis from");
    expect(html).not.toContain("No analysis yet");
    expect(html).not.toContain("Convene Committee");
  });
});
