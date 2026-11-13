import { renderWithInstanceAdminMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { AdminRoute } from "@/lib/instance-admin/routes";
import { ossAdminRoutes } from "@/lib/instance-admin/routes";
import messages from "@/messages/core/en/instance-admin.json";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: vi.fn(), extra: [] as AdminRoute[] }));
vi.mock("@/lib/auth/instance-admin", () => ({ requireInstanceAdmin: mocks.access }));
vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: async () => ({ locale: "en", timeZone: "UTC" }),
}));
vi.mock("@/lib/instance-admin/navigation-extension", () => ({
  adminPageNavigationExtension: () => mocks.extra,
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string, values?: Record<string, string>) => {
    const text = key
      .split(".")
      .reduce<unknown>(
        (obj, segment) => (obj as Record<string, unknown>)[segment],
        messages.instanceAdmin,
      ) as string;
    return values ? text.replace("{tab}", values.tab) : text;
  },
}));

import { AdminRouteFrame } from "./AdminRouteFrame";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.extra = [];
  mocks.access.mockResolvedValue({ user: { id: "admin" } });
});
it.each(ossAdminRoutes)("server-renders $view navigation and question", async (route) => {
  const result = render(await AdminRouteFrame({ view: route.view, children: <p>Live page</p> }));
  expect(mocks.access).toHaveBeenCalledOnce();
  expect(result.getByRole("heading", { level: 2 }).textContent).not.toBe(route.view);
  expect(
    result
      .getAllByRole("link")
      .some(
        (link) =>
          link.getAttribute("href") === route.href && link.getAttribute("aria-current") === "page",
      ),
  ).toBe(true);
  expect(result.getAllByRole("navigation")).toHaveLength(
    route.tab === "Operations" || route.tab === "Email" ? 2 : 1,
  );
});
it("inserts deployment routes in the accepted order without importing their components", async () => {
  mocks.extra = [
    {
      tab: "Revenue",
      view: "Subscriptions",
      href: "/app/admin/revenue/subscriptions",
      tabKey: "navigation.revenue",
      viewKey: "shell.subscriptions",
      questionKey: "pages.questions.status",
    },
  ];
  const result = render(
    await AdminRouteFrame({ view: "Subscriptions", children: <p>Deployment content</p> }),
  );
  const tabs = result.getAllByRole("navigation")[0];
  expect(Array.from(tabs.querySelectorAll("a")).map((item) => item.textContent)).toEqual([
    "Overview",
    "Operations",
    "Users",
    "Revenue",
    "Email",
    "Audit",
    "Settings",
  ]);
});
it("fails closed before rendering navigation", async () => {
  mocks.access.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
  await expect(AdminRouteFrame({ view: "Status", children: null })).rejects.toThrow(
    "NEXT_NOT_FOUND",
  );
});
