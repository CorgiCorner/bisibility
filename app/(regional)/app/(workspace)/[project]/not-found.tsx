import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { createIntlTranslator } from "@/i18n/translator.server";
import { appRootPath } from "@/lib/routing/app-path";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const runtime = await resolveRegionalDocumentLocale();
  const t = createIntlTranslator(runtime.locale, runtime.messages, runtime);
  return {
    alternates: { canonical: null },
    robots: { follow: false, index: false },
    title: t("shared.projectItemNotFound.title"),
  };
}

/**
 * Reached only from inside a project the viewer can already read: this boundary renders under
 * the project layout, so the layout's own access check has succeeded before it. The app-level
 * boundary keeps the "unknown project or not a member" copy for the throw that happens there.
 */
export default async function ProjectItemNotFound() {
  const runtime = await resolveRegionalDocumentLocale();
  const t = createIntlTranslator(runtime.locale, runtime.messages, runtime);

  return (
    <main className="flex min-h-[60vh] items-center justify-center px-6 py-12 text-fg">
      <EmptyState
        action={
          <Button component="a" href={appRootPath()} size="lg" variant="secondary">
            {t("shared.projectItemNotFound.backToProjects")}
          </Button>
        }
        description={t("shared.projectItemNotFound.description")}
        footnote={t("shared.projectItemNotFound.footnote")}
        icon={<MagnifyingGlass aria-hidden size={28} weight="regular" />}
        title={t("shared.projectItemNotFound.pageTitle")}
      />
    </main>
  );
}
