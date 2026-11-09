import { notFound, routerMock, setNavigationState } from "@/tests/next-navigation";
import { vi } from "vitest";

const realPage = vi.hoisted(() => ({
  operational: vi.fn(),
  allowance: vi.fn(),
  accounts: vi.fn(),
  lookup: vi.fn(),
  mail: vi.fn(),
  configured: vi.fn(),
  tasks: vi.fn(),
  audit: vi.fn(),
  send: vi.fn(),
  sweep: vi.fn(),
  change: vi.fn(),
  reset: vi.fn(),
  save: vi.fn(),
  clear: vi.fn(),
  preview: vi.fn(),
  commit: vi.fn(),
  triage: vi.fn(),
  command: vi.fn(),
  access: vi.fn(),
  allowed: true,
  extraRoutes: [] as import("@/lib/instance-admin/routes").AdminRoute[],
  locale: "en" as "en" | "pl" | "ja" | "es-ES",
  params: new URLSearchParams(),
  path: "/app/admin/overview/status",
  navigate: (_url: string) => {},
  refresh: () => {},
}));
vi.mock("@/lib/queries/instance-admin-operational", () => ({
  getInstanceAdminOperationalData: realPage.operational,
}));
vi.mock("@/lib/email/allowance", () => ({ getInstanceAdminEmailAllowance: realPage.allowance }));
vi.mock("@/lib/queries/admin/oss-account-list", async () => ({
  ...(await import("@/lib/instance-admin/account-list-input")),
  readAccountList: realPage.accounts,
}));
vi.mock("@/lib/email/instance-mail-store", () => ({
  loadInstanceMailSettingsView: realPage.mail,
  refreshInstanceMailRuntime: async () => {},
}));
vi.mock("@/lib/email/registry", () => ({ isEmailConfigured: realPage.configured }));
vi.mock("@/lib/metering/recovery/service", () => ({ getRecoveryPage: realPage.tasks }));
vi.mock("@/lib/queries/instance-admin-audit", () => ({
  getInstanceAdminAuditPage: realPage.audit,
}));
vi.mock("@/lib/queries/admin/oss-access", () => ({ ossAdminSession: realPage.access }));
vi.mock("@/lib/auth/instance-admin", () => ({ requireInstanceAdmin: realPage.access }));
vi.mock("@/lib/auth/admin-dangerous-action", () => ({
  adminDangerousActionAllowed: async () => realPage.allowed,
}));
vi.mock("@/lib/instance-admin/navigation-extension", () => ({
  adminPageNavigationExtension: () => realPage.extraRoutes,
}));
vi.mock("@/components/shell/AdminPageExtension", () => ({
  extendAdminPage: async ({ children }: { children: unknown }) => children,
}));
vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: async () => ({ locale: realPage.locale, timeZone: "UTC" }),
}));
vi.mock("next-intl/server", async () => ({
  getTranslations: async ({ namespace }: { namespace: string }) => {
    const { createTranslator } = await import("next-intl");
    const catalog = await import(`../../../messages/core/${realPage.locale}/instance-admin.json`);
    return createTranslator({ locale: realPage.locale, messages: catalog.default, namespace });
  },
}));
vi.mock("@/lib/actions/instance-admin", () => ({
  sendTestSlackNotification: realPage.send,
  runOpsSweepNow: realPage.sweep,
}));
vi.mock("@/lib/actions/instance-admin-account-actions", () => ({
  setInstanceAdminAccountDeactivated: realPage.change,
  resetInstanceAdminAccountLimits: realPage.reset,
}));
vi.mock("@/lib/actions/instance-admin-pages", () => ({ lookupOssAdminAccount: realPage.lookup }));
vi.mock("@/lib/actions/instance-mail-settings", () => ({
  saveInstanceMailSettings: realPage.save,
  clearInstanceMailSettings: realPage.clear,
}));
vi.mock("@/lib/actions/metering-recovery", () => ({
  previewRecoveryAction: realPage.preview,
  commitRecoveryAction: realPage.commit,
  updateRecoveryTriageAction: realPage.triage,
  getRecoveryCommandAction: realPage.command,
}));

export { realPage };

export function syncRealPageNavigation() {
  setNavigationState({ pathname: realPage.path, searchParams: realPage.params });
  routerMock.push.mockImplementation((url: string) => realPage.navigate(url));
  routerMock.refresh.mockImplementation(() => realPage.refresh());
  notFound.mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  });
}
