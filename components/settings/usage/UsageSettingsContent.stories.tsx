import { withUsageSettingsMessages } from "@/.storybook/settings-shell-messages";
import type { ProjectBudgetRow } from "@/lib/metering/project-budget-display";
import { budgetFixture, projectUsageFixture } from "@/lib/metering/shared-view-fixtures";
import { emptyProjectUsage, type ProjectUsageViews } from "@/lib/metering/user-views";
import type { Meta, StoryObj } from "@storybook/react";
import { ProviderUsageCard } from "./ProviderUsageCard";

type Reading = {
  used: string;
  limit?: string;
  level?: ProjectBudgetRow["level"];
  certainty?: "measured" | "estimated";
};

/** One provider traffic limit, shaped like the self-host project in the demo. */
function limitRow(
  connectionId: string,
  providerLabel: string,
  surface: "app" | "programmatic",
  unit: string,
  { used, limit, level = "ok", certainty = "measured" }: Reading,
): ProjectBudgetRow {
  const amount = (text: string) => ({ text, unit, certainty });
  const capped = limit !== undefined;
  return {
    ...budgetFixture(used, unit),
    id: `${connectionId}:${surface}`,
    kind: "connection",
    target: connectionId,
    traffic: { kind: "surface", surface },
    used: amount(used),
    limit: capped ? { text: limit, unit, certainty: "measured" } : "unlimited",
    remaining: capped ? amount(String(Number(limit) - Number(used))) : "unlimited",
    bar: capped ? { used, reserved: "0", limit, hardLimit: null, alerts: [] } : null,
    level,
    display: { connectionId, providerLabel, projectName: "flowtools.co" },
  };
}

function selfHostUsage(serpApiUsed = "13", level: ProjectBudgetRow["level"] = "ok") {
  const data: ProjectUsageViews = projectUsageFixture();
  data.connections = [
    { connectionId: "conn_serpapi", provider: "SerpApi", credentialSource: "own" },
    { connectionId: "conn_dataforseo", provider: "DataForSEO", credentialSource: "own" },
  ];
  data.budgets = [
    {
      ...budgetFixture("39", "budget_cents"),
      id: "own-project",
      limit: { text: "500", unit: "budget_cents", certainty: "measured" },
      remaining: { text: "461", unit: "budget_cents", certainty: "measured" },
      bar: { used: "7.8", reserved: "0", limit: "100", hardLimit: null, alerts: [] },
    },
    limitRow("conn_serpapi", "SerpApi", "app", "units", {
      used: serpApiUsed,
      limit: "245",
      level,
    }),
    limitRow("conn_serpapi", "SerpApi", "programmatic", "units", { used: "0" }),
    limitRow("conn_dataforseo", "DataForSEO", "app", "budget_cents", { used: "26" }),
    limitRow("conn_dataforseo", "DataForSEO", "programmatic", "budget_cents", { used: "0" }),
  ];
  return data;
}

const meta = {
  title: "Settings/Usage",
  component: ProviderUsageCard,
  decorators: [withUsageSettingsMessages],
  args: {
    projectName: "flowtools.co",
    data: selfHostUsage(),
    canEditBudget: true,
    projectId: "prj_story",
    projectRef: "prj_story",
  },
} satisfies Meta<typeof ProviderUsageCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SelfHost: Story = {};
export const ReadOnlyViewer: Story = { args: { canEditBudget: false } };
export const NearLimit: Story = { args: { data: selfHostUsage("220", "warning") } };
export const LimitReached: Story = { args: { data: selfHostUsage("245", "exceeded") } };
export const NoLimitsYet: Story = {
  args: {
    data: {
      ...selfHostUsage(),
      budgets: selfHostUsage().budgets.map((row) =>
        row.kind === "connection" ? { ...row, limit: "unlimited", remaining: "unlimited" } : row,
      ),
    },
  },
};
export const NoProviders: Story = {
  args: { data: { ...emptyProjectUsage(), status: "available" } },
};
export const UsageUnknown: Story = { args: { data: emptyProjectUsage() } };
export const Loading: Story = UsageUnknown;
export const RouteLoading: Story = UsageUnknown;

export const TwentyProviders: Story = {
  args: {
    data: {
      ...selfHostUsage(),
      connections: Array.from({ length: 20 }, (_, index) => ({
        connectionId: `conn_${index}`,
        provider: `Provider ${index + 1}`,
        credentialSource: "own" as const,
      })),
      budgets: Array.from({ length: 20 }, (_, index) =>
        limitRow(`conn_${index}`, `Provider ${index + 1}`, "app", "units", {
          used: String(index * 4),
          limit: "100",
        }),
      ),
    },
  },
};

/** Owner-reported demo shapes: an idle surface, open provider receipts and a failed read. */
function limitStates() {
  const data = selfHostUsage();
  data.budgets = [
    data.budgets[0],
    limitRow("conn_serpapi", "SerpApi", "app", "units", { used: "13", limit: "245" }),
    limitRow("conn_serpapi", "SerpApi", "programmatic", "units", { used: "0", limit: "245" }),
    limitRow("conn_dataforseo", "DataForSEO", "app", "cents", {
      used: "26",
      limit: "48",
      certainty: "estimated",
    }),
    {
      ...limitRow("conn_dataforseo", "DataForSEO", "programmatic", "cents", {
        used: "0",
        limit: "48",
      }),
      used: "unavailable",
      reserved: "unavailable",
      remaining: "unavailable",
      bar: null,
      level: "unavailable",
    },
  ];
  return data;
}
export const ZeroOnUnusedSurface: Story = {
  args: {
    data: {
      ...limitStates(),
      budgets: limitStates().budgets.filter(
        (row) => row.target === "conn_serpapi" || row.kind === "group",
      ),
    },
  },
};
export const EstimatedUsage: Story = {
  args: {
    data: {
      ...limitStates(),
      budgets: limitStates().budgets.filter((row) => row.id !== "conn_dataforseo:programmatic"),
    },
  },
};
export const GenuineUnknown: Story = { args: { data: limitStates() } };
