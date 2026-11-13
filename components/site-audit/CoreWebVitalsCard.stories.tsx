import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import type { CoreWebVitalsCardModel } from "@/lib/pagespeed/view";
import messages from "@/messages/core/en/project-site-audit.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CoreWebVitalsCard } from "./CoreWebVitalsCard";

const fieldModel: CoreWebVitalsCardModel = {
  connected: true,
  desktop: {
    passCount: 1,
    rows: [{ cls: 0.01, inpMs: 80, lcpMs: 1600, path: "/", source: "field", status: "good" }],
  },
  mobile: {
    passCount: 1,
    rows: [
      { cls: 0.02, inpMs: 120, lcpMs: 2100, path: "/", source: "field", status: "good" },
      {
        cls: 0.18,
        inpMs: 240,
        lcpMs: 2600,
        path: "/docs",
        source: "origin",
        status: "needs_improvement",
      },
      { cls: 0.31, inpMs: null, lcpMs: 4600, path: "/pricing", source: "lab", status: "poor" },
    ],
  },
};

const meta = {
  component: CoreWebVitalsCard,
  decorators: [
    (Story) => (
      <FeatureMessagesProvider
        locale="en"
        messages={{ ...sharedMessages, ...messages }}
        timeZone="UTC"
      >
        <div className="max-w-5xl p-4">
          <Story />
        </div>
      </FeatureMessagesProvider>
    ),
  ],
  title: "App/SiteAudit/CoreWebVitals",
} satisfies Meta<typeof CoreWebVitalsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FieldData: Story = {
  args: {
    canCheck: true,
    checkAction: async () => ({ checked: 3, ok: true }),
    model: fieldModel,
    projectId: "prj_story",
  },
};

export const LabFallback: Story = {
  args: {
    canCheck: true,
    checkAction: async () => ({ checked: 1, ok: true }),
    model: {
      connected: true,
      desktop: { passCount: 0, rows: [] },
      mobile: {
        passCount: 0,
        rows: [
          { cls: 0.31, inpMs: null, lcpMs: 4600, path: "/pricing", source: "lab", status: "poor" },
        ],
      },
    },
    projectId: "prj_story",
  },
};

export const NotConnected: Story = {
  args: {
    canCheck: false,
    checkAction: async () => ({ checked: 0, code: "not_connected", ok: false }),
    model: {
      connected: false,
      desktop: { passCount: 0, rows: [] },
      mobile: { passCount: 0, rows: [] },
    },
    projectId: "prj_story",
  },
};
