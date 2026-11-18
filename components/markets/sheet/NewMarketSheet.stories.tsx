import { storyLocale } from "@/.storybook/story-locale";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { catalogMarketDefinitionSource } from "@/components/markets/blocks/market-definition-source";
import { projectMarketsFeatureTestMessages } from "@/i18n/test-support/feature-test-messages";
import es from "@/messages/core/es-ES/project-markets.json";
import ja from "@/messages/core/ja/project-markets.json";
import pl from "@/messages/core/pl/project-markets.json";
import type { Meta, StoryObj } from "@storybook/react";
import { NewMarketSheet } from "./NewMarketSheet";

const marketMessages = { en: projectMarketsFeatureTestMessages, pl, "es-ES": es, ja };

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
  decorators: [
    (Story, context) => (
      <FeatureMessagesProvider
        locale={storyLocale(context.globals.locale)}
        timeZone="UTC"
        messages={marketMessages[storyLocale(context.globals.locale)]}
      >
        <Story />
      </FeatureMessagesProvider>
    ),
  ],
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
      projectDefaults: { provider: null, serpDepth: 100 },
      projectTimezone: "Europe/Warsaw",
    },
    schedules: [{ frequency: "weekly", id: `sch_${"c".repeat(24)}`, name: "Weekly Monday" }],
    source,
    sources: [{ id: `pmkt_${"d".repeat(24)}`, keywordCount: 12, name: "Spanish core" }],
  },
};
