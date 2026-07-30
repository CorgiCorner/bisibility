import { redirect } from "next/navigation";

// The self-host build has no vendor marketing site; redirect its root to login,
// which routes users to setup or the app.
export const dynamic = "force-dynamic";

export default function RootPage(): never {
  redirect("/login");
}
