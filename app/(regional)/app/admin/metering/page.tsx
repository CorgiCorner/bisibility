import { AdminMeteringFilters } from "@/components/admin/AdminMeteringFilters";
import { AdminMeteringView } from "@/components/admin/AdminMeteringView";
import { AdminRecoveryConsole } from "@/components/admin/recovery/AdminRecoveryConsole";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { createIntlTranslator } from "@/i18n/translator.server";
import { getMeteringAdminPage } from "@/lib/metering/admin-service";
import { getRecoveryLanding } from "@/lib/metering/recovery/service";
import Link from "next/link";
export default async function MeteringPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const input = await searchParams;
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const incidents = first(input?.tab) === "incidents";
  const locale = await resolveRegionalDocumentLocale();
  const messages = await loadCoreMessages(locale.locale, ["instanceAdmin"]);
  const t = createIntlTranslator(locale.locale, messages, locale);
  const page = incidents
    ? null
    : await getMeteringAdminPage({ month: first(input?.month), project: first(input?.project) });
  const recovery = incidents ? await getRecoveryLanding() : null;
  return (
    <div className="grid min-w-0 gap-6">
      <div>
        <h1 className="text-lg font-semibold text-fg">{t("instanceAdmin.metering.heading")}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-fg-muted">
          {t("instanceAdmin.metering.description")}
        </p>
      </div>
      <nav
        className="flex flex-wrap gap-4 text-sm"
        aria-label={t("instanceAdmin.metering.heading")}
      >
        <Link
          href="/app/admin/metering"
          aria-current={incidents ? undefined : "page"}
          className={incidents ? "text-fg-muted" : "font-semibold text-accent"}
        >
          {t("instanceAdmin.recovery.usageTab")}
        </Link>
        <Link
          href="/app/admin/metering/recovery"
          aria-current={incidents ? "page" : undefined}
          className={incidents ? "font-semibold text-accent" : "text-fg-muted"}
        >
          {t("instanceAdmin.recovery.openIncidents")}
        </Link>
      </nav>
      {page && (
        <>
          <AdminMeteringFilters {...page} projects={page.data?.projects ?? []} />
          <AdminMeteringView data={page.data} month={page.month} project={page.project} />
        </>
      )}
      {incidents && <AdminRecoveryConsole initial={recovery} />}
    </div>
  );
}
