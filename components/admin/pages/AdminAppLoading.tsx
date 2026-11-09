import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { adminPageNavigationExtension } from "@/lib/instance-admin/navigation-extension";
import { ossAdminRoutes } from "@/lib/instance-admin/routes";
import { AdminPageLoading } from "./AdminPageLoading";

/** Cold admin entry uses the same route skeleton as subsequent navigation. */
export async function AdminAppLoading({ path }: { path: string }) {
  const { locale, timeZone } = await resolveRegionalDocumentLocale();
  const routes = [...ossAdminRoutes, ...adminPageNavigationExtension(locale)];
  const view = routes.find((route) => route.href === path)?.view ?? "Status";
  const messages = await loadCoreMessages(locale, ["shared", "instanceAdmin"]);
  return (
    <FeatureMessagesProvider locale={locale} timeZone={timeZone} messages={messages}>
      <AdminPageLoading view={view} />
    </FeatureMessagesProvider>
  );
}
