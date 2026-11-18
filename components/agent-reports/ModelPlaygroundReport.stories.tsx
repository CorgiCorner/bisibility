import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { input, result } from "@/lib/model-playground/contract-fixtures.test-support";
import { buildModelPlaygroundReport } from "@/lib/model-playground/report-body";
import { entities } from "@/lib/model-playground/result-fixtures.test-support";
import ai from "@/messages/core/en/project-ai-research.json";
import shared from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ModelPlaygroundReport } from "./ModelPlaygroundReport";

const body = buildModelPlaygroundReport(
  "019a70b2-0000-7000-8000-000000000001",
  input(),
  [result()],
  entities,
  "2026-11-13T08:00:00Z",
);
const meta = {
  title: "Research/Model Playground Report",
  component: ModelPlaygroundReport,
  args: { body },
  parameters: { layout: "padded", themeControls: false },
  decorators: [
    (Story) => (
      <FeatureMessagesProvider locale="en" timeZone="UTC" messages={{ ...shared, ...ai }}>
        <Story />
      </FeatureMessagesProvider>
    ),
  ],
} satisfies Meta<typeof ModelPlaygroundReport>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Saved: Story = {};
