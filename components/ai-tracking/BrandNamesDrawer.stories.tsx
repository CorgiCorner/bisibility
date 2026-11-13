import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import trackingMessages from "@/messages/core/en/project-ai-tracking.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { BrandNamesDrawer } from "./BrandNamesDrawer";

const preview = async () => ({ answers: 2, named: 1, names: [{ count: 1, name: "Acme" }] });
const save = async () => undefined;

const meta = {
  title: "AI Visibility/Brand names",
  component: BrandNamesDrawer,
  decorators: [
    (Story) => (
      <FeatureMessagesProvider
        locale="en"
        messages={{ ...sharedMessages, ...trackingMessages }}
        timeZone="UTC"
      >
        <Story />
      </FeatureMessagesProvider>
    ),
  ],
  args: {
    canWrite: true,
    domain: "acme.example.com",
    domainSuggestion: "acme.example",
    entityId: "prj_abcdefghijklmnopqrstuvwx",
    entityKind: "project",
    initialAliases: ["Acme Tools"],
    initialCounts: { answers: 2, named: 1, names: [{ count: 1, name: "Acme" }] },
    initialExcludedNames: ["acme.example.org"],
    keywordSuggestions: ["best acme tools"],
    label: "Acme",
    onClose: () => undefined,
    open: true,
    preview,
    save,
  },
} satisfies Meta<typeof BrandNamesDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OwnBrand: Story = {};

export const Competitor: Story = {
  args: {
    domain: "other.example.com",
    domainSuggestion: "other.example",
    entityId: "cmp_abcdefghijklmnopqrstuvwx",
    entityKind: "competitor",
    initialAliases: ["Other Co"],
    keywordSuggestions: ["best other tools"],
    label: "Other",
  },
};

export const EmptyAnswers: Story = {
  args: {
    domainSuggestion: null,
    initialAliases: [],
    initialCounts: { answers: 0, named: 0, names: [] },
    initialExcludedNames: [],
    keywordSuggestions: [],
  },
};
