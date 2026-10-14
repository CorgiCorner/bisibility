import type { SetupChoices } from "@/lib/local-monitors/contracts";
import type { Meta, StoryObj } from "@storybook/react";
import { MonitorForm } from "./MonitorForm";

const choices: SetupChoices = {
  subjects: [
    {
      id: "biz_abcdefghijklmnopqrstuvwx",
      name: "Example branch",
      address: "Example street 1",
      coordinates: { latitude: 52.2297, longitude: 21.0122 },
      identityRevisionId: "example-revision",
    },
  ],
  keywords: [{ id: "kw_abcdefghijklmnopqrstuvwx", text: "Dentist near me", device: "desktop" }],
  subjectsMore: false,
  keywordsMore: false,
  nextSubject: null,
  nextKeyword: null,
  permissions: { canRead: true, canWrite: true },
};
const meta = {
  title: "Local monitors/Explicit setup",
  component: MonitorForm,
  args: {
    projectId: "prj_abcdefghijklmnopqrstuvwx",
    choices,
    save: async () => ({ kind: "unavailable" as const }),
    search: async () => choices,
    onSaved: () => undefined,
    onCancel: () => undefined,
  },
} satisfies Meta<typeof MonitorForm>;
export default meta;
type Story = StoryObj<typeof meta>;
export const New: Story = {};
export const Viewer: Story = {
  args: { choices: { ...choices, permissions: { canRead: true, canWrite: false } } },
};
export const MissingSubject: Story = { args: { choices: { ...choices, subjects: [] } } };
