import { describe, expect, it } from "vitest";
import { signInSchema, signUpSchema } from "@/lib/auth-schema";

const goodPassword = "correct-horse";

describe("email checking on the sign-in / sign-up forms", () => {
  it("accepts real-looking addresses, including work domains", () => {
    for (const email of [
      "Ahmed@gmail.com",
      "ahmed.al.balushi@omantel.net.om",
      "a.b+tag@sub.example.co.uk",
    ]) {
      expect(
        signInSchema.safeParse({ email, password: goodPassword }).success,
      ).toBe(true);
    }
  });

  it("rejects anything that is not name@domain.tld", () => {
    for (const email of [
      "",
      "ahmed",
      "ahmed@",
      "ahmed@gmail",
      "@gmail.com",
      "ahmed al@gmail.com",
      "ahmed@@gmail.com",
    ]) {
      expect(
        signInSchema.safeParse({ email, password: goodPassword }).success,
      ).toBe(false);
    }
  });

  it("explains the problem in plain English and names the field", () => {
    const result = signInSchema.safeParse({
      email: "ahmed",
      password: goodPassword,
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.path[0]).toBe("email");
    expect(result.error.issues[0]?.message).toBe(
      "Enter a real email address, like Ahmed@gmail.com.",
    );
  });

  it("trims stray spaces around a pasted address", () => {
    const result = signInSchema.safeParse({
      email: "  Ahmed@gmail.com  ",
      password: goodPassword,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.email).toBe("Ahmed@gmail.com");
  });
});

describe("sign-up extras", () => {
  it("needs a name and an 8+ character password", () => {
    expect(
      signUpSchema.safeParse({
        name: "  ",
        email: "Ahmed@gmail.com",
        password: goodPassword,
      }).success,
    ).toBe(false);
    expect(
      signUpSchema.safeParse({
        name: "Ahmed Al Balushi",
        email: "Ahmed@gmail.com",
        password: "short",
      }).success,
    ).toBe(false);
    expect(
      signUpSchema.safeParse({
        name: "Ahmed Al Balushi",
        email: "Ahmed@gmail.com",
        password: goodPassword,
      }).success,
    ).toBe(true);
  });
});
