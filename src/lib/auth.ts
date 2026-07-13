import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/prisma";

/**
 * Sign-up gating (ALLOW_SIGNUPS): sign-ups stay open unless the environment
 * variable is set to the literal string "false". When disabled, Better Auth
 * rejects sign-up attempts server-side (disableSignUp) and the /sign-up page
 * shows a registration-closed message instead of the form.
 */
export function signUpsAllowed(): boolean {
  return process.env.ALLOW_SIGNUPS !== "false";
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: !signUpsAllowed(),
  },
});
