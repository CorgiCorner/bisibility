import { renderWithInstanceAdminMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { setNavigationState } from "@/tests/next-navigation";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  overview: vi.fn(),
  worker: vi.fn(),
  checks: vi.fn(),
  sources: vi.fn(),
  notifications: vi.fn(),
  accounts: vi.fn(),
  sending: vi.fn(),
  settings: vi.fn(),
  tasks: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("@/lib/auth/admin-dangerous-action", () => ({
  adminDangerousActionAllowed: async () => true,
}));
vi.mock("@/lib/auth/instance-admin", () => ({ requireInstanceAdmin: mocks.access }));
vi.mock("@/lib/queries/admin/oss-operations", () => ({
  getOssOverview: mocks.overview,
  getOssWorker: mocks.worker,
  getOssChecks: mocks.checks,
  getOssDataSources: mocks.sources,
  getOssNotifications: mocks.notifications,
}));
vi.mock("@/lib/queries/admin/oss-accounts", () => ({ getOssAccounts: mocks.accounts }));
vi.mock("@/lib/queries/admin/oss-email", () => ({
  getOssEmailSending: mocks.sending,
  getOssEmailSettings: mocks.settings,
}));
vi.mock("@/lib/queries/admin/oss-tasks", () => ({ getOssTasks: mocks.tasks }));
vi.mock("@/lib/queries/admin/oss-audit", () => ({ getOssAudit: mocks.audit }));
vi.mock("./AdminRouteFrame", () => ({
  AdminRouteFrame: ({ view, children }: { view: string; children: ReactNode }) => (
    <section aria-label={view}>{children}</section>
  ),
}));
vi.mock("@/components/ui/toast-context", () => ({ useToast: () => ({ showToast: vi.fn() }) }));

import AuditPage from "@/app/(regional)/app/admin/audit/page";
import SendingPage from "@/app/(regional)/app/admin/email/sending-today/page";
import SettingsPage from "@/app/(regional)/app/admin/email/settings/page";
import ChecksPage from "@/app/(regional)/app/admin/operations/checks/page";
import DataSourcesPage from "@/app/(regional)/app/admin/operations/data-sources/page";
import NotificationsPage from "@/app/(regional)/app/admin/operations/notifications/page";
import TasksPage from "@/app/(regional)/app/admin/operations/tasks/page";
import WorkerPage from "@/app/(regional)/app/admin/operations/worker/page";
import StatusPage from "@/app/(regional)/app/admin/overview/status/page";
import AccountsPage from "@/app/(regional)/app/admin/users/accounts/page";
import { fixture } from "./page-fixtures.test-fixture";

const routes = {
  "overview/status": StatusPage,
  "operations/worker": WorkerPage,
  "operations/checks": ChecksPage,
  "operations/data-sources": DataSourcesPage,
  "operations/notifications": NotificationsPage,
  "users/accounts": AccountsPage,
  "email/sending-today": SendingPage,
  "email/settings": SettingsPage,
  "operations/tasks": TasksPage,
  audit: AuditPage,
};
const cases = [
  ["Status", "overview/status", mocks.overview, "Worker", "operations"],
  ["Worker", "operations/worker", mocks.worker, "Temporal", "operations"],
  ["Checks", "operations/checks", mocks.checks, "Last 7 days", "operations"],
  ["Data sources", "operations/data-sources", mocks.sources, "Data sources", "operations"],
  [
    "Notifications",
    "operations/notifications",
    mocks.notifications,
    "Run outbox sweep",
    "operations",
  ],
  ["Accounts", "users/accounts", mocks.accounts, "operator@example.test", "accounts"],
  ["Sending today", "email/sending-today", mocks.sending, "Email sending today", "email"],
  ["Settings", "email/settings", mocks.settings, "Instance email settings", "settings"],
  ["Tasks", "operations/tasks", mocks.tasks, "Recovery console", "tasks"],
  ["Audit", "audit", mocks.audit, "instance_admin.account_deactivated", "audit"],
] as const;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ user: { id: "admin" } });
  setNavigationState({
    pathname: "/app/admin/users/accounts",
    searchParams: new URLSearchParams(),
  });
  for (const [, , load, , key] of cases) load.mockResolvedValue(fixture[key]);
});
describe.each(cases)("%s server route", (_view, path, load, marker) => {
  const route = async () => routes[path];
  it.each(["unauthenticated", "non-admin"])("rejects %s before builder reads", async () => {
    mocks.access.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect((await route())({})).rejects.toThrow("NEXT_NOT_FOUND");
    for (const [, , read] of cases) expect(read).not.toHaveBeenCalled();
  });
  it("authorizes and renders its fixture builder output through the real composition", async () => {
    const element = await (await route())({});
    const result = render(element);
    expect(mocks.access).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledOnce();
    expect(result.container).toHaveTextContent(marker);
    expect(result.container).not.toHaveTextContent("Sample data");
    for (const removed of ["Monthly recurring revenue", "Top consumption", "Spend this month"])
      expect(result.container).not.toHaveTextContent(removed);
  });
  it("renders recoverable failure without fixture content", async () => {
    load.mockRejectedValue(new Error("database offline"));
    const result = render(await (await route())({}));
    expect(result.getByRole("alert")).toHaveTextContent("Instance data is unavailable.");
    expect(result.getByRole("button", { name: "Try again" })).toBeVisible();
  });
});
it("passes bounded account query parameters to the builder", async () => {
  const Page = routes["users/accounts"];
  await Page({
    searchParams: Promise.resolve({
      search: "op",
      sort: "projects",
      direction: "asc",
      page: "2",
      pageSize: "10",
    }),
  });
  expect(mocks.accounts).toHaveBeenCalledWith({
    search: "op",
    sort: "projects",
    direction: "asc",
    page: 2,
    pageSize: 10,
  });
});
it("passes task filters and audit cursors to the matching builders", async () => {
  const Tasks = routes["operations/tasks"];
  const Audit = routes.audit;
  await Tasks({
    searchParams: Promise.resolve({ provider: "dataforseo", category: "failed", cursor: "next" }),
  });
  await Audit({ searchParams: Promise.resolve({ filter: "account", cursor: "older" }) });
  expect(mocks.tasks).toHaveBeenCalledWith({
    provider: "dataforseo",
    category: "failed",
    cursor: "next",
  });
  expect(mocks.audit).toHaveBeenCalledWith({ filter: "account", cursor: "older" });
});
