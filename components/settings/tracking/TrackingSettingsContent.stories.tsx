import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import { TrackingSettingsContent } from "@/components/settings/tracking/TrackingSettingsContent";
import {
  TrackingSettingsLoading,
  TrackingSettingsRouteLoading,
} from "@/components/settings/tracking/TrackingSettingsLoading";
import type { CronPreviewResult } from "@/lib/actions/settings-cron-preview";
import type { DefaultsData } from "@/lib/settings/options";
import type { Meta, StoryObj } from "@storybook/react";
import type { ReactNode } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

const projectId = "prj_7Kd2Qf9m";
const locationFixture = [
  {
    canonical_key: "PL",
    city_name: null,
    country_code: "PL",
    display_name: "Poland",
    id: "country:PL",
    kind: "country",
    region_name: null,
  },
  {
    canonical_key: "PF",
    city_name: null,
    country_code: "PF",
    display_name: "French Polynesia",
    id: "country:PF",
    kind: "country",
    region_name: null,
  },
];
const readyPreview: CronPreviewResult = {
  message: "Each keyword is scheduled at or after an anchor using deterministic jitter.",
  runs: ["Aug 10, 06:00", "Aug 11, 06:00", "Aug 12, 06:00"],
  status: "ready",
};
const defaults: DefaultsData = {
  city: null,
  costPerCheck: 0.0155,
  country: "Poland",
  device: "Desktop",
  deviceCount: 1,
  inspectionDailyLimit: 100,
  keywordCount: 248,
  locationCount: 1,
  locationKey: "PL",
  locationLabel: "Poland",
  schedule: {
    cron_expression: null,
    frequency: "daily",
    jitter_minutes: 60,
    last_checked_at: "2026-08-08T06:00:00.000Z",
    next_check_at: "2026-08-09T06:00:00.000Z",
    timezone: "Europe/Warsaw",
  },
  serpDepth: 100,
  serpStopOnMatch: true,
  targetUrlCount: 42,
};

function TrackingStoryShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main className="min-h-screen bg-bg p-4 text-fg sm:p-6">
      <SettingsShell activeSection="tracking" projectRef={projectId}>
        {children}
      </SettingsShell>
    </main>
  );
}

const meta = {
  component: TrackingSettingsContent,
  decorators: [
    (Story) => {
      const original = window.fetch;
      window.fetch = (async (input: RequestInfo | URL) =>
        String(input).includes("/api/locations/search")
          ? new Response(JSON.stringify({ data: locationFixture }), {
              headers: { "content-type": "application/json" },
            })
          : original(input)) as typeof window.fetch;
      return <Story />;
    },
  ],
  parameters: { nextjs: { appDirectory: true } },
  title: "Settings/Tracking",
} satisfies Meta<typeof TrackingSettingsContent>;

export default meta;
type Story = StoryObj<typeof meta>;

const args = {
  canEdit: true,
  defaults,
  domain: "example.com",
  initialCronPreview: { message: "", runs: [], status: "idle" } as CronPreviewResult,
  previewCron: fn(async () => readyPreview),
  projectId,
  updateDefaults: fn(async () => ({})),
} satisfies Story["args"];

function renderContent(storyArgs: Story["args"]) {
  return (
    <TrackingStoryShell>
      <TrackingSettingsContent {...storyArgs} />
    </TrackingStoryShell>
  );
}

export const Settled: Story = { args, render: renderContent };

export const FrequencyOpenCustom: Story = {
  args: {
    ...args,
    defaults: {
      ...defaults,
      schedule: { ...defaults.schedule, cron_expression: "0 6 * * 1-5", frequency: "custom_cron" },
    },
    initialCronPreview: readyPreview,
  },
  name: "STATE · frequency open, custom chosen",
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Frequency" }));
    await waitFor(() =>
      expect(
        within(canvasElement.ownerDocument.body).getByRole("menu", { name: "Frequency" }),
      ).toBeVisible(),
    );
  },
  render: renderContent,
};

export const LocationOpenTypedPol: Story = {
  args,
  name: 'STATE · location open, typed "pol"',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const location = canvas.getByRole("combobox", { name: "Location" });
    await userEvent.clear(location);
    await userEvent.type(location, "pol");
    await expect(await canvas.findByRole("option", { name: /Poland/ })).toBeVisible();
  },
  render: renderContent,
};

export const DepthLowered: Story = {
  args,
  name: "STATE · depth lowered below the current one",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Default SERP depth" }));
    await userEvent.click(body.getByRole("menuitem", { name: "Top 20" }));
    await expect(canvas.getByText(/ranking past 20/)).toBeVisible();
  },
  render: renderContent,
};

export const Loading: Story = {
  args,
  render: () => (
    <TrackingStoryShell>
      <TrackingSettingsLoading />
    </TrackingStoryShell>
  ),
};

export const RouteLoading: Story = {
  args,
  name: "Route loading",
  render: () => (
    <main className="min-h-screen bg-bg p-4 text-fg sm:p-6">
      <TrackingSettingsRouteLoading />
    </main>
  ),
};
