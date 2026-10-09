// Sign-in page: the shared AuthShell (go-public-ui.md §2.1) around the
// client form.

import { AuthShell } from "@/components/auth/auth-shell";
import { SignInForm } from "./sign-in-form";

export default function SignInPage() {
  return (
    <AuthShell>
      <SignInForm />
    </AuthShell>
  );
}
