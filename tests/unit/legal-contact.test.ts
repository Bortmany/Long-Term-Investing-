import { describe, expect, it } from "vitest";

import { DEFAULT_LEGAL_CONTACT_EMAIL, getLegalContactEmail } from "@/lib/legal-contact";

describe("getLegalContactEmail", () => {
  it("falls back to the owner's address when the variable is unset", () => {
    expect(getLegalContactEmail({})).toBe(DEFAULT_LEGAL_CONTACT_EMAIL);
    expect(getLegalContactEmail({ PRIVACY_CONTACT_EMAIL: undefined })).toBe(
      "naeljam@hotmail.com",
    );
  });

  it("treats a blank or whitespace-only value as unset", () => {
    expect(getLegalContactEmail({ PRIVACY_CONTACT_EMAIL: "" })).toBe(DEFAULT_LEGAL_CONTACT_EMAIL);
    expect(getLegalContactEmail({ PRIVACY_CONTACT_EMAIL: "   " })).toBe(
      DEFAULT_LEGAL_CONTACT_EMAIL,
    );
  });

  it("uses the configured address when one is set (trimmed)", () => {
    expect(getLegalContactEmail({ PRIVACY_CONTACT_EMAIL: "privacy@example.com" })).toBe(
      "privacy@example.com",
    );
    expect(getLegalContactEmail({ PRIVACY_CONTACT_EMAIL: "  privacy@example.com \n" })).toBe(
      "privacy@example.com",
    );
  });
});
