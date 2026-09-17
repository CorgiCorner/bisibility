import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuditSettingsPage from "./page";

const mocks = vi.hoisted(() => ({
  getAuditLogView: vi.fn(),
  getPreferences: vi.fn(),
  loadCoreMessages: vi.fn(),
  resolveProjectAccess: vi.fn(),
  resolveRegionalDocumentLocale: vi.fn(),
  viewProps: undefined as unknown,
}));

vi.mock("@/components/audit", () => ({
  AuditLogView: (props: unknown) => {
    mocks.viewProps = props;
    return <div data-audit-view="" />;
  },
  AuditNotAuthorized: () => <div data-audit-restricted="" />,
}));
vi.mock("@/components/i18n/FeatureMessagesProvider", () => ({
  FeatureMessagesProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/i18n/catalog-loader.server", () => ({ loadCoreMessages: mocks.loadCoreMessages }));
vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: mocks.resolveRegionalDocumentLocale,
}));
vi.mock("@/lib/queries/_auth", () => ({ resolveProjectAccess: mocks.resolveProjectAccess }));
vi.mock("@/lib/queries/account", () => ({ getPreferences: mocks.getPreferences }));
vi.mock("@/lib/queries/audit", () => ({ getAuditLogView: mocks.getAuditLogView }));

describe("AuditSettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.viewProps = undefined;
    mocks.loadCoreMessages.mockResolvedValue({});
    mocks.resolveProjectAccess.mockResolvedValue({ publicId: "prj_1" });
    mocks.resolveRegionalDocumentLocale.mockResolvedValue({ locale: "en", timeZone: "UTC" });
  });

  it("loads the narrow audit catalog and passes the audit view through unchanged", async () => {
    const audit = {
      authorized: true as const,
      dateRange: "30d" as const,
      entries: [],
      entryLimit: 200,
      retentionDays: 365,
      truncated: false,
    };
    mocks.getAuditLogView.mockResolvedValue(audit);
    mocks.getPreferences.mockResolvedValue({ dateFormat: "month_first" });

    render(
      await AuditSettingsPage({
        params: Promise.resolve({ project: "prj_1" }),
        searchParams: Promise.resolve({ range: "90d" }),
      }),
    );

    expect(mocks.loadCoreMessages).toHaveBeenCalledWith("en", ["shared", "projectAudit"]);
    expect(mocks.getAuditLogView).toHaveBeenCalledWith("prj_1", { dateRange: "90d" });
    expect(mocks.viewProps).toEqual({
      dateRange: "30d",
      dateDisplay: { dateFormat: "month_first", locale: "en", timeZone: "UTC" },
      entries: [],
      entryLimit: 200,
      retentionDays: 365,
      truncated: false,
    });
  });

  it("keeps the authorization guard while still loading the route catalog", async () => {
    mocks.getAuditLogView.mockResolvedValue({ authorized: false });
    mocks.getPreferences.mockResolvedValue({ dateFormat: "month_first" });

    const { container } = render(
      await AuditSettingsPage({ params: Promise.resolve({ project: "prj_1" }) }),
    );

    expect(container.querySelector("[data-audit-restricted]")).toBeTruthy();
    expect(mocks.viewProps).toBeUndefined();
    expect(mocks.loadCoreMessages).toHaveBeenCalledWith("en", ["shared", "projectAudit"]);
  });
});
