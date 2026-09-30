// Reset password (go-public-ui.md §2.7). The emailed link goes through
// Better Auth's own check first, which sends the browser here with either
// ?token=… (the link is good) or ?error=INVALID_TOKEN (wrong, used or
// expired). No token at all gets the same friendly "invalid link" card.

import { AuthShell } from "@/components/auth/auth-shell";
import { InvalidResetLinkCard, ResetPasswordForm } from "./reset-password-form";

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = first(params.token)?.trim();
  const error = first(params.error);

  return (
    <AuthShell>
      {token && !error ? <ResetPasswordForm token={token} /> : <InvalidResetLinkCard />}
    </AuthShell>
  );
}
