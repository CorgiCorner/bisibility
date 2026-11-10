import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { createIntlTranslator } from "@/i18n/translator.server";
import { requireInstanceAdmin } from "@/lib/auth/instance-admin";
import { adminPageNavigationExtension } from "@/lib/instance-admin/navigation-extension";
import {
  type AdminRoute,
  adminTabOrder,
  ossAdminRoute,
  ossAdminRoutes,
} from "@/lib/instance-admin/routes";
import type { ReactNode } from "react";
import { AdminRouteChrome } from "./AdminRouteChrome";

/** Shared server frame for core routes and deployment-provided routes. */
export async function AdminRouteFrame({
  view,
  children,
  loading = false,
}: {
  view: string;
  children: ReactNode;
  loading?: boolean;
}) {
  await requireInstanceAdmin();
  const { locale, timeZone } = await resolveRegionalDocumentLocale();
  const messages = await loadCoreMessages(locale, ["instanceAdmin"]);
  const translate = createIntlTranslator(locale, messages, { timeZone });
  const t = (
    key:
      | AdminRoute["tabKey"]
      | AdminRoute["viewKey"]
      | AdminRoute["questionKey"]
      | "shell.context"
      | "shell.backToApp"
      | "shell.title"
      | "pages.description"
      | "navigation.label",
  ) => translate(`instanceAdmin.${key}`);
  const routes = [...ossAdminRoutes, ...adminPageNavigationExtension(locale)];
  const active = routes.find((route) => route.view === view) ?? ossAdminRoute(view);
  const tabs = adminTabOrder.flatMap((tab) => {
    const route = routes.find((item) => item.tab === tab);
    return route ? [route] : [];
  });
  const subtabs = routes.filter((route) => route.tab === active.tab);
  return (
    <AdminRouteChrome
      active={active}
      loading={loading}
      tabs={tabs}
      subtabs={subtabs}
      labels={{
        context: t("shell.context"),
        back: t("shell.backToApp"),
        title: t("shell.title"),
        description: `${t("pages.description")} ${translate("instanceAdmin.dashboard.timeZone", { timeZone })}`,
        navigation: t("navigation.label"),
        views: translate("instanceAdmin.shell.viewNavigation", {
          tab: active.tabLabel ?? t(active.tabKey),
        }),
        question: active.question ?? t(active.questionKey),
        tabs: Object.fromEntries(
          routes.map((route) => [route.tab, route.tabLabel ?? t(route.tabKey)]),
        ),
        subtabs: Object.fromEntries(
          routes.map((route) => [route.view, route.viewLabel ?? t(route.viewKey)]),
        ),
      }}
    >
      {children}
    </AdminRouteChrome>
  );
}
