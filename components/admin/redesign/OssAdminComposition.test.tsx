import { baseData } from "@/components/admin/admin-dashboard-test-fixtures";
import { OssAdminComposition } from "@/components/admin/redesign/OssAdminComposition";
import type { OssAdminData } from "@/components/admin/redesign/OssAdminViews";
import { ossNavigation } from "@/components/admin/redesign/PreviewShell";
import { renderWithInstanceAdminMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { recoveryViewFixture } from "@/lib/metering/recovery/view-fixture";
import { expect, it } from "vitest";

const allowance = {
  asOf: "2026-10-14T23:59:00.000Z",
  day: "2026-10-14T00:00:00.000Z",
  resetsAt: "2026-10-15T00:00:00.000Z",
  scope: "installation" as const,
  status: "available" as const,
  categories: [],
};
const oss: OssAdminData = {
  operations: {
    data: baseData,
    emailAllowance: allowance,
    onSendTest: () => {},
    onRunSweep: () => {},
  },
  emailAllowance: { allowance },
  recovery: {
    page: recoveryViewFixture(),
    onRefresh: () => {},
    onPreview: () => {},
    onConfirm: () => {},
    onSaveTriage: () => {},
    onRetryCommand: () => {},
    onPage: () => {},
    onFilterChange: () => {},
  },
  administration: {
    account: null,
    onLookup: () => {},
    onAccountAction: () => {},
    onSaveMail: () => {},
    onClearMail: () => {},
  },
  audit: { entries: [], onNext: () => {} },
};

const ossMarkers: Record<string, string> = {
  Status: "Worker",
  Worker: "Temporal",
  Checks: "Last 7 days",
  "Data sources": "Data sources",
  Notifications: "Run outbox sweep",
  "Sending today": "Email sending today",
  Tasks: "Recovery console",
  Accounts: "Find an account",
  Settings: "Instance email settings",
  Audit: "Audit activity",
};

it.each(Object.entries(ossNavigation).flatMap(([tab, views]) => views.map((view) => [tab, view])))(
  "renders only permitted sections on %s / %s",
  (tab, view) => {
    const result = render(<OssAdminComposition data={oss} initialTab={tab} initialView={view} />);
    expect(result.container).toHaveTextContent(ossMarkers[view]);
    for (const removed of [
      "Growth",
      "Top consumption",
      "Instance statistics",
      "Provider usage reference",
      "Recorded usage",
      "Current budgets",
      "New announcement",
      "Spend this month",
      "AI engine",
      "Provider credentials",
    ]) {
      expect(result.container).not.toHaveTextContent(removed);
    }
  },
  60000,
);
it("shows unavailable tasks without inventing sample facts", () => {
  const result = render(
    <OssAdminComposition
      data={{ ...oss, recovery: null }}
      initialTab="Operations"
      initialView="Tasks"
    />,
  );
  expect(result.getByRole("status")).toHaveTextContent("Instance data is unavailable.");
});
