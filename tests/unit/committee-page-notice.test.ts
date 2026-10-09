import { describe, expect, it } from "vitest";
import { committeePageNotice } from "@/lib/committee-page-notice";

describe("committeePageNotice", () => {
  it("Free user, no stock, no key: Pro notice, not 'AI is off'", () => {
    expect(
      committeePageNotice({ hasStock: false, mode: "committee", proLocked: true, hasAiKey: false }),
    ).toBe("pro");
  });
  it("Free user, no stock, key present: still the Pro notice", () => {
    expect(
      committeePageNotice({ hasStock: false, mode: "committee", proLocked: true, hasAiKey: true }),
    ).toBe("pro");
  });
  it("Pro user with no key sees the no-key notice", () => {
    expect(
      committeePageNotice({ hasStock: false, mode: "committee", proLocked: false, hasAiKey: false }),
    ).toBe("no-key");
  });
  it("Upside/Downside are not Pro, so Free gets the key notice there", () => {
    expect(
      committeePageNotice({ hasStock: false, mode: "buy", proLocked: true, hasAiKey: false }),
    ).toBe("no-key");
  });
  it("shows nothing once a stock is picked, or when all is well", () => {
    expect(
      committeePageNotice({ hasStock: true, mode: "committee", proLocked: true, hasAiKey: false }),
    ).toBeNull();
    expect(
      committeePageNotice({ hasStock: false, mode: "committee", proLocked: false, hasAiKey: true }),
    ).toBeNull();
  });
});
