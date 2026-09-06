// The contact address shown on the public /privacy and /terms pages.
//
// Read on the server only (both pages are server components). The address is
// configurable through PRIVACY_CONTACT_EMAIL so a deployment can point it at
// a different inbox; when the variable is unset or blank, it falls back to the
// owner's address. This is a public contact address, not a secret.

export const DEFAULT_LEGAL_CONTACT_EMAIL = "naeljam@hotmail.com";

/** Returns the trimmed PRIVACY_CONTACT_EMAIL, or the owner's default address. */
export function getLegalContactEmail(
  env: Record<string, string | undefined> = process.env,
): string {
  const configured = env.PRIVACY_CONTACT_EMAIL?.trim();
  return configured ? configured : DEFAULT_LEGAL_CONTACT_EMAIL;
}
