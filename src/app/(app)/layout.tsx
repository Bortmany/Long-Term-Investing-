import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

// Layout for every authenticated page: validates the session server-side
// (src/proxy.ts only checks the cookie optimistically) and wraps the page
// in the app shell (sidebar / rail / mobile drawer).
export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Defense in depth: this intentionally duplicates src/proxy.ts's check — the proxy only sees the cookie and never validates the session, so it alone is not sufficient.
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/sign-in");
  }

  return <AppShell email={session.user.email}>{children}</AppShell>;
}
