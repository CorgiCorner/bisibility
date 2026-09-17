import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { createIntlTranslator } from "@/i18n/translator.server";
import { getSession } from "@/lib/auth/session";
import { appRootPath } from "@/lib/routing/app-path";
import { SquaresFourIcon as SquaresFour } from "@phosphor-icons/react/dist/ssr/SquaresFour";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const runtime = await resolveRegionalDocumentLocale();
  const t = createIntlTranslator(runtime.locale, runtime.messages, runtime);
  return {
    alternates: { canonical: null },
    robots: { follow: false, index: false },
    title: t("shared.appNotFound.title"),
  };
}

// The identity line is read per request; a cached shell would name the wrong account.
export const dynamic = "force-dynamic";

export default async function AppNotFound() {
  const runtime = await resolveRegionalDocumentLocale();
  const t = createIntlTranslator(runtime.locale, runtime.messages, runtime);
  const session = await getSession();
  const email = session?.user?.email ?? null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-6 py-12 text-fg">
      <EmptyState
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <Button component="a" href={appRootPath()} size="lg">
              {t("shared.appNotFound.backToProjects")}
            </Button>
            <Button component="a" href="/login?switch=1" size="lg" variant="secondary">
              {t("shared.appNotFound.signInDifferentAccount")}
            </Button>
          </div>
        }
        description={
          email
            ? t("shared.appNotFound.descriptionSignedIn", { email })
            : t("shared.appNotFound.description")
        }
        footnote={t("shared.appNotFound.footnote")}
        icon={<SquaresFour aria-hidden size={28} weight="regular" />}
        title={t("shared.appNotFound.pageTitle")}
      />
    </main>
  );
}
