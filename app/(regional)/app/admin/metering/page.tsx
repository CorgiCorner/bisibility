import { AdminMeteringFilters } from "@/components/admin/AdminMeteringFilters";
import { AdminMeteringView } from "@/components/admin/AdminMeteringView";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { createIntlTranslator } from "@/i18n/translator.server";
import { getMeteringAdminPage } from "@/lib/metering/admin-service";
export default async function MeteringPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const input = await searchParams;
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const page = await getMeteringAdminPage({
    month: first(input?.month),
    project: first(input?.project),
  });
  const locale = await resolveRegionalDocumentLocale();
  const messages = await loadCoreMessages(locale.locale, ["instanceAdmin"]);
  const t = createIntlTranslator(locale.locale, messages, locale);
  return (
    <div className="grid min-w-0 gap-6">
      <div>
        <h1 className="text-lg font-semibold text-fg">{t("instanceAdmin.metering.heading")}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-fg-muted">
          {t("instanceAdmin.metering.description")}
        </p>
      </div>
      <AdminMeteringFilters {...page} projects={page.data?.projects ?? []} />
      <AdminMeteringView data={page.data} />
    </div>
  );
}
