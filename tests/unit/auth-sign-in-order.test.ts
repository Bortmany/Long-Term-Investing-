// Pins Better Auth's ORDER of checks on sign-in (go-public spec A4): the
// password is checked BEFORE "is this email confirmed?". So a WRONG password
// on an unconfirmed account gets the ordinary "invalid email or password"
// answer (the screen shows "Incorrect email or password.") and never reveals
// that the address is registered — and no confirmation email goes out.
// Only the RIGHT password on an unconfirmed account gets EMAIL_NOT_VERIFIED
// (and a fresh link). If a Better Auth upgrade ever swaps that order, this
// test fails.
//
// Uses a real Better Auth instance with its in-memory adapter (no database)
// and the same email options src/lib/auth.ts sets when email is configured.

import { describe, expect, it, vi } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";

function makeAuth() {
  const sendVerificationEmail = vi.fn(async () => {});
  const db: Record<string, unknown[]> = { user: [], session: [], account: [], verification: [] };
  const auth = betterAuth({
    secret: "unit-test-secret-that-is-at-least-32-characters-long",
    baseURL: "http://localhost:3000",
    database: memoryAdapter(db),
    rateLimit: { enabled: false },
    emailAndPassword: { enabled: true, requireEmailVerification: true },
    emailVerification: {
      sendVerificationEmail,
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: 86400,
    },
  });
  return { auth, sendVerificationEmail };
}

async function signIn(auth: ReturnType<typeof makeAuth>["auth"], email: string, password: string) {
  const response = await auth.handler(
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ email, password }),
    }),
  );
  const body = (await response.json()) as { code?: string };
  return { status: response.status, code: body.code };
}

describe("sign-in check order on an unconfirmed account", () => {
  it("wrong password → the ordinary invalid-credentials answer, and no email is sent", async () => {
    const { auth, sendVerificationEmail } = makeAuth();
    await auth.api.signUpEmail({
      body: { name: "Ahmed Al Balushi", email: "ahmed@example.com", password: "correct-horse-1" },
    });
    sendVerificationEmail.mockClear();

    const result = await signIn(auth, "ahmed@example.com", "wrong-password-9");
    expect(result.status).toBe(401);
    expect(result.code).toBe("INVALID_EMAIL_OR_PASSWORD");
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("an unknown address gets exactly the same answer as a wrong password", async () => {
    const { auth } = makeAuth();
    const result = await signIn(auth, "nobody@example.com", "whatever-123");
    expect(result.status).toBe(401);
    expect(result.code).toBe("INVALID_EMAIL_OR_PASSWORD");
  });

  it("right password → EMAIL_NOT_VERIFIED and a fresh confirmation email", async () => {
    const { auth, sendVerificationEmail } = makeAuth();
    await auth.api.signUpEmail({
      body: { name: "Ahmed Al Balushi", email: "ahmed@example.com", password: "correct-horse-1" },
    });
    sendVerificationEmail.mockClear();

    const result = await signIn(auth, "ahmed@example.com", "correct-horse-1");
    expect(result.status).toBe(403);
    expect(result.code).toBe("EMAIL_NOT_VERIFIED");
    expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
  });

  it("sign-up with email checks on does NOT sign the person in", async () => {
    const { auth, sendVerificationEmail } = makeAuth();
    const result = await auth.api.signUpEmail({
      body: { name: "Ahmed Al Balushi", email: "new@example.com", password: "correct-horse-1" },
    });
    expect(result.token).toBeNull();
    expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
  });
});
