import { catalogMarketDefinitionSource } from "@/components/markets/blocks/market-definition-source";
import type { Meta, StoryObj } from "@storybook/react";
import { NewMarketSheet } from "./NewMarketSheet";

const projectId = `prj_${"a".repeat(24)}`;

/** The bundled catalogs plus a canned place search, so the story never reaches the network. */
const source = {
  ...catalogMarketDefinitionSource(projectId),
  searchLocations: async (query: string, countryCode: string) =>
    countryCode === "ES" && /mal/i.test(query)
      ? [
          {
            canonicalKey: "ES/Andalusia/Malaga",
            countryCode: "ES",
            displayName: "Malaga, Andalusia, Spain",
            kind: "city" as const,
          },
        ]
      : [],
};

const meta = {
  component: NewMarketSheet,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  title: "Markets/Sheet/NewMarketSheet",
} satisfies Meta<typeof NewMarketSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    onClose: () => {},
    onCreate: async () => ({
      canonicalKey: "ES",
      countryCode: "ES",
      displayName: "Spain",
      keywordCount: 0,
      kind: "country" as const,
      languageCode: "es",
      languageLabel: "Spanish",
      publicId: `pmkt_${"b".repeat(24)}`,
    }),
    open: true,
    projectId,
    registry: [
      { canonicalKey: "ES", id: `pmkt_${"e".repeat(24)}`, status: "active" },
      { canonicalKey: "BE@nl", id: `pmkt_${"f".repeat(24)}`, status: "archived" },
    ],
    scheduleContext: {
      connectedProviders: [],
      defaultScheduleName: "Weekly Monday",
      projectDefaults: { provider: null, serpDepth: 100 },
      projectTimezone: "Europe/Warsaw",
    },
    schedules: [{ frequency: "weekly", id: `sch_${"c".repeat(24)}`, name: "Weekly Monday" }],
    source,
    sources: [{ id: `pmkt_${"d".repeat(24)}`, keywordCount: 12, name: "Spanish core" }],
  },
};
