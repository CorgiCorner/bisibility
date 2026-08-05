import { Button, EmptyState } from "@/components/ui";
import { getSession } from "@/lib/auth/session";
import { appRootPath } from "@/lib/routing/app-path";
import { SquaresFourIcon as SquaresFour } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: null },
  robots: { follow: false, index: false },
  title: "Page not available",
};

// The identity line is read per request; a cached shell would name the wrong account.
export const dynamic = "force-dynamic";

export default async function AppNotFound() {
  const session = await getSession();
  const email = session?.user?.email ?? null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-6 py-12 text-fg">
      <EmptyState
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <Button
              component="a"
              href={appRootPath()}
              size="lg"
              startIcon={<SquaresFour size={16} weight="bold" />}
            >
              Back to your projects
            </Button>
            <Button component="a" href="/login?switch=1" size="lg" variant="secondary">
              Sign in with a different account
            </Button>
          </div>
        }
        description={
          email
            ? `Signed in as ${email}. This project either does not exist or that account is not a member of it. If a teammate sent the link, they may be on a different account than the one you are using here.`
            : "This project either does not exist or your account is not a member of it."
        }
        footnote="404 - Not found"
        icon={<SquaresFour aria-hidden size={28} weight="bold" />}
        title="This page is not available"
      />
    </main>
  );
}
