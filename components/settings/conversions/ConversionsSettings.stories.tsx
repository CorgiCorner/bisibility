import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { ConversionsSettings } from "@/components/settings/conversions/ConversionsSettings";
import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import { DEFAULT_LOCALE } from "@/i18n/config";
import { DEFAULT_TIME_ZONE } from "@/i18n/formats";
import type { ConversionsSettingsModel } from "@/lib/conversions/types";
import projectSettingsConversions from "@/messages/core/en/project-settings-conversions.json";
import projectSettingsShell from "@/messages/core/en/project-settings-shell.json";
import shared from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import type { ReactNode } from "react";

const projectId = "prj_7Kd2Qf9m";

const messages = mergeMessageCatalogs(shared, projectSettingsShell, projectSettingsConversions);

const actions = {
  setPrimary: async () => ({ ok: true as const }),
  syncSource: async () => ({ ok: true as const }),
  updateGoal: async () => ({ ok: true as const }),
};

function source(
  sourceId: "ga4" | "plausible",
  connected: boolean,
  primary: boolean,
): ConversionsSettingsModel["sources"][number] {
  const ga4 = sourceId === "ga4";
  return {
    connected,
    conversions28: connected ? (ga4 ? 128 : 46) : 0,
    label: ga4 ? "Google Analytics 4" : "Plausible",
    lastDay: connected ? "2026-03-28" : null,
    logoDomain: ga4 ? "google.com" : "plausible.io",
    primary,
    reportsRevenue: false,
    source: sourceId,
  };
}

function goal(
  id: string,
  sourceId: "ga4" | "plausible",
  sourceName: string,
  displayName: string,
  last28: number,
  enabled = true,
): ConversionsSettingsModel["goals"][number] {
  return {
    countsRevenue: false,
    displayName,
    enabled,
    id,
    last28,
    reportsRevenue: false,
    source: sourceId,
    sourceLabel: sourceId === "ga4" ? "Google Analytics 4" : "Plausible",
    sourceName,
  };
}

const twoSources: ConversionsSettingsModel = {
  comparison: [
    {
      cells: [
        { count: 128, currency: null, revenueMinor: null, source: "ga4" },
        { count: null, currency: null, revenueMinor: null, source: "plausible" },
      ],
      displayName: "Key events",
    },
    {
      cells: [
        { count: null, currency: null, revenueMinor: null, source: "ga4" },
        { count: 46, currency: null, revenueMinor: null, source: "plausible" },
      ],
      displayName: "Signup",
    },
    {
      cells: [
        { count: null, currency: null, revenueMinor: null, source: "ga4" },
        { count: 18, currency: null, revenueMinor: null, source: "plausible" },
      ],
      displayName: "Trial started",
    },
  ],
  goals: [
    goal("goal_ga4", "ga4", "key_events", "Key events", 128),
    goal("goal_signup", "plausible", "Signup", "Signup", 46),
    goal("goal_trial", "plausible", "Trial started", "Trial started", 18, false),
  ],
  primary: "ga4",
  showComparison: true,
  sources: [source("ga4", true, true), source("plausible", true, false)],
};

const oneSource: ConversionsSettingsModel = {
  comparison: [],
  goals: [goal("goal_ga4", "ga4", "key_events", "Key events", 128)],
  primary: "ga4",
  showComparison: false,
  sources: [source("ga4", true, true), source("plausible", false, false)],
};

const none: ConversionsSettingsModel = {
  comparison: [],
  goals: [],
  primary: null,
  showComparison: false,
  sources: [source("ga4", false, false), source("plausible", false, false)],
};

function StoryShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <FeatureMessagesProvider
      locale={DEFAULT_LOCALE}
      messages={messages}
      timeZone={DEFAULT_TIME_ZONE}
    >
      <main className="min-h-screen bg-bg p-4 text-fg sm:p-6">
        <SettingsShell activeSection="conversions" projectRef={projectId}>
          {children}
        </SettingsShell>
      </main>
    </FeatureMessagesProvider>
  );
}

const meta = {
  component: ConversionsSettings,
  parameters: { nextjs: { appDirectory: true } },
  title: "Settings/Conversions",
} satisfies Meta<typeof ConversionsSettings>;

export default meta;

type Story = StoryObj<typeof meta>;

function story(model: ConversionsSettingsModel): Story {
  return {
    args: {
      actions,
      canEdit: true,
      connectHref: `/app/${projectId}/settings/data-sources`,
      model,
      projectId,
    },
    render: (args) => (
      <StoryShell>
        <ConversionsSettings {...args} />
      </StoryShell>
    ),
  };
}

export const TwoSources: Story = story(twoSources);
export const OneSource: Story = story(oneSource);
export const None: Story = story(none);
