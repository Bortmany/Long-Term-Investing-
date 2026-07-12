import { redirect } from "next/navigation";

// The dashboard is the home screen. Signed-out visitors never reach this —
// src/proxy.ts already redirects them to /sign-in.
export default function HomePage() {
  redirect("/dashboard");
}
