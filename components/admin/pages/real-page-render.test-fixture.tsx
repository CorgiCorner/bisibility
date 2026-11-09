import { ToastProvider } from "@/components/ui/Toast";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import type { AppLocale } from "@/i18n/config";
import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import { ossAdminRoute } from "@/lib/instance-admin/routes";
import { isValidElement, type ReactElement } from "react";
import { afterEach } from "vitest";
import { AdminPageLoading } from "./AdminPageLoading";
import { AdminRouteFrame } from "./AdminRouteFrame";
import { realPage, syncRealPageNavigation } from "./real-page-mocks.test-fixture";
import { realRoutes } from "./real-page-routes.test-fixture";

let unmountCurrent: (() => void) | undefined;
afterEach(() => {
  unmountCurrent?.();
  unmountCurrent = undefined;
});

export async function renderRealPage(view: string, locale: AppLocale = "en", loading = false) {
  realPage.locale = locale;
  realPage.path = ossAdminRoute(view).href;
  const messages = mergeMessageCatalogs(
    (await import(`../../../messages/core/${locale}/shared.json`)).default,
    (await import(`../../../messages/core/${locale}/instance-admin.json`)).default,
  );
  async function element() {
    syncRealPageNavigation();
    const page = loading
      ? AdminPageLoading({ view })
      : await realRoutes[view as keyof typeof realRoutes]({
          searchParams: Promise.resolve(Object.fromEntries(realPage.params)),
        });
    if (!isValidElement(page) || page.type !== AdminRouteFrame)
      throw new Error("Expected the real server frame");
    return (
      <ToastProvider>
        {await AdminRouteFrame(page.props as Parameters<typeof AdminRouteFrame>[0])}
      </ToastProvider>
    );
  }
  const result = renderWithFeatureMessages((await element()) as ReactElement, {
    locale,
    messages,
    timeZone: "Europe/Warsaw",
  });
  let mounted = true;
  const unmount = result.unmount;
  result.unmount = () => {
    mounted = false;
    unmount();
  };
  const rerender = async () => {
    const node = await element();
    if (mounted) result.rerender(node as ReactElement);
  };
  unmountCurrent = result.unmount;
  realPage.navigate = (url) => {
    const next = new URL(url, "http://localhost");
    realPage.params = next.searchParams;
    // Render the real server page again, as App Router navigation does.
    void rerender();
  };
  realPage.refresh = () => {
    void rerender();
  };
  return result;
}
