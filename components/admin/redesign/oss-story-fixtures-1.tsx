import { storyLocale, storyTimeZone } from "@/.storybook/story-locale";
import { baseData, busyTemporal } from "@/components/admin/admin-dashboard-test-fixtures";
import { DateDisplayProvider } from "@/components/dates/DateFormatProvider";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { ToastProvider } from "@/components/ui/Toast";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import { recoveryViewFixture } from "@/lib/metering/recovery/view-fixture";
import instanceMessages from "@/messages/core/en/instance-admin.json";
import sharedMessages from "@/messages/core/en/shared.json";
import instanceEs from "@/messages/core/es-ES/instance-admin.json";
import sharedEs from "@/messages/core/es-ES/shared.json";
import instanceJa from "@/messages/core/ja/instance-admin.json";
import sharedJa from "@/messages/core/ja/shared.json";
import instancePl from "@/messages/core/pl/instance-admin.json";
import sharedPl from "@/messages/core/pl/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { OssAdminComposition } from "./OssAdminComposition";
import type { OssAdminData } from "./OssAdminViews";
import { requireFixture } from "./require-fixture";

export const failure = {
  count: 4,
  errorSummary: "Failure example",
  provider: "Failure provider",
  projectCount: 1,
  projectIds: ["failure-project"],
  firstSeen: "2026-07-17T10:00:00Z",
  lastSeen: "2026-07-17T11:00:00Z",
};

export const fallback = {
  ...failure,
  count: 5,
  errorSummary: "Fallback example",
  provider: "Fallback provider",
  projectIds: ["fallback-project"],
};

export const dashboard = {
  ...baseData,
  stats: {
    ...baseData.stats,
    providerUsage: baseData.stats.providerUsage.map((row) =>
      row.provider === "serpapi"
        ? { ...row, checks: 12, billableUnits: 12 }
        : { ...row, checks: 2, billableUnits: 2 },
    ),
  },
  rank24h: {
    ...baseData.rank24h,
    failureBreakdown: { groups: [failure], remainderCount: 2 },
    fallbackBreakdown: { groups: [fallback], remainderCount: 3 },
  },
  temporal: {
    ...busyTemporal,
    bootstrapErrors: ["Startup check failed"],
    heartbeat: {
      ...busyTemporal.heartbeat,
      inspectionErrors: 1,
      issueSchedules: busyTemporal.heartbeat.issueSchedules.map((issue) =>
        issue.replaceAll("maintenance-metering-reservations", "maintenance-reservations"),
      ),
      scheduleIssues: busyTemporal.heartbeat.scheduleIssues.map((issue) =>
        issue.scheduleId === "maintenance-metering-reservations"
          ? { ...issue, scheduleId: "maintenance-reservations" }
          : issue,
      ),
    },
  },
  providerHealth: [
    {
      provider: "Unknown source",
      ok: 0,
      stale: 0,
      failed: 0,
      notRun: 1,
      p95AgeMs: null,
      failureRatePercent: null,
    },
  ],
};

type PopulatedFixture = { [K in keyof OssAdminData]: NonNullable<OssAdminData[K]> } & {
  recovery: NonNullable<OssAdminData["recovery"]> & {
    page: NonNullable<NonNullable<OssAdminData["recovery"]>["page"]>;
  };
};
export const sampleData: PopulatedFixture = {
  operations: {
    data: dashboard,

    onSendTest: () => ({ status: "delivered" }),
    onRunSweep: () => ({ status: "completed", attempted: 3, delivered: 2 }),
  },
  emailAllowance: {
    allowance: {
      asOf: "2026-07-17T12:00:00Z",
      day: "2026-07-17T00:00:00Z",
      resetsAt: "2026-07-18T00:00:00Z",
      scope: "installation",
      status: "available",
      categories: [],
    },
  },

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

  audit: {
    entries: [
      {
        id: "1",
        time: "2026-07-17T12:00:00Z",
        actor: "operator",
        action: "Changed setting",
        target: "sample-target",
        result: "blocked",
        targetType: "user",
        category: "setup",
      },
    ],
    onNext: () => {},
  },
};

export const operations = requireFixture(sampleData.operations);

export const meta = {
  title: "Admin redesign/OSS composition",
  component: OssAdminComposition,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  args: { data: sampleData, refresh: { onRefresh: () => {} } },
  decorators: [
    (Story, context) => {
      const locale = storyLocale(context.globals.locale);
      const shared = { en: sharedMessages, pl: sharedPl, ja: sharedJa, "es-ES": sharedEs };
      const instance = {
        en: instanceMessages,
        pl: instancePl,
        ja: instanceJa,
        "es-ES": instanceEs,
      };
      return (
        <FeatureMessagesProvider
          locale={locale}
          timeZone={storyTimeZone(context.globals.timeZone)}
          messages={mergeMessageCatalogs(shared[locale], instance[locale])}
        >
          <DateDisplayProvider>
            <ToastProvider>
              <Story />
            </ToastProvider>
          </DateDisplayProvider>
        </FeatureMessagesProvider>
      );
    },
  ],
} satisfies Meta<typeof OssAdminComposition>;

export type Story = StoryObj<typeof meta>;

export const Overview: Story = { globals: { timeZone: "Europe/Warsaw" } };

export const DisabledWorker: Story = {
  args: {
    data: {
      ...sampleData,
      operations: {
        ...operations,
        data: { ...dashboard, worker: { ...dashboard.worker, schedulerDriver: "none" } },
      },
    },
  },
};

export const UnknownWorker: Story = {
  args: {
    data: {
      ...sampleData,
      operations: {
        ...operations,
        data: { ...dashboard, availability: { ...dashboard.availability, worker: false } },
      },
    },
  },
};

export const WorkerBehind: Story = {
  args: {
    data: {
      ...sampleData,
      operations: {
        ...operations,
        data: { ...dashboard, worker: { ...dashboard.worker, schemaComparison: "worker-behind" } },
      },
    },
  },
};
