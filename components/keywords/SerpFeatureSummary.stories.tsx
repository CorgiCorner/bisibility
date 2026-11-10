import { storyLocale } from "@/.storybook/story-locale";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { Card } from "@/components/ui/Card";
import { serpFeaturePresentation } from "@/lib/checks/serp-feature-presentation";
import en from "@/messages/core/en/project-rank-tracker-keyword-detail.json";
import shared from "@/messages/core/en/shared.json";
import es from "@/messages/core/es-ES/project-rank-tracker-keyword-detail.json";
import ja from "@/messages/core/ja/project-rank-tracker-keyword-detail.json";
import pl from "@/messages/core/pl/project-rank-tracker-keyword-detail.json";
import type { Meta, StoryObj } from "@storybook/react";
import { ResolveSerpUrls } from "./ResolveSerpUrls";
import { SerpFeatureSummary } from "./SerpFeatureSummary";

const origin = typeof window === "undefined" ? "https://example.test" : window.location.origin;
const features = serpFeaturePresentation(
  [],
  [],
  [
    {
      ai_overview: { text_blocks: [{ snippet: "A saved overview." }] },
      knowledge_graph: {
        title: "Trail Coffee",
        description: "Coffee roasted in small batches.",
        attributes: [
          { name: "Location", value: "Warsaw, Poland" },
          { name: "Founded", value: "2020" },
        ],
      },
      inline_images: [
        {
          title: "Dashboard overview",
          thumbnail: `${origin}/screenshots/dashboard-overview.png`,
          link: "https://example.com/golden-gate",
        },
        {
          title: "Full dashboard",
          thumbnail: `${origin}/screenshots/dashboard-overview-full.png`,
          link: "https://example.com/machu-picchu",
        },
      ],
      shopping_results: [
        {
          title: "House blend, 250g",
          source: "Trail Coffee",
          price: "$12.50",
          rating: 4.8,
          reviews: 24,
          link: "https://example.com/coffee",
        },
        {
          title: "Decaf, 250g",
          source: "Trail Coffee",
          price: "$13.50",
          link: "https://example.com/decaf",
        },
      ],
      related_questions: [
        {
          question: "How should I store coffee?",
          snippet: "Keep coffee in an airtight container, away from heat and light.",
          link: "https://example.com/storage",
        },
      ],
      inline_videos: [
        {
          title: "How to brew a balanced cup",
          source: "Trail Coffee",
          link: "https://example.com/brewing",
          snippet: "A short guide to brewing at home.",
        },
      ],
    },
  ],
);
const meta = {
  title: "Keywords/SERP feature previews",
  component: SerpFeatureSummary,
  decorators: [
    (Story, context) => {
      const locale = storyLocale(context.globals.locale);
      const messages = ({ en, pl, "es-ES": es, ja } as Record<string, typeof en>)[locale] ?? en;
      return (
        <FeatureMessagesProvider
          locale={locale || "en"}
          timeZone="UTC"
          messages={{ ...shared, ...messages }}
        >
          <div className="p-4">
            <Story />
          </div>
        </FeatureMessagesProvider>
      );
    },
  ],
} satisfies Meta<typeof SerpFeatureSummary>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Comparison: Story = {
  args: { features },
  render: () => (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      {[
        features,
        { ...features, richFeatures: features.richFeatures?.filter((x) => x.kind !== "shopping") },
      ].map((value, index) => (
        <Card key={index} className="min-w-0 overflow-hidden p-0">
          <h2 className="m-0 border-b border-border px-5 py-4 text-ui-section">
            {index ? "SerpApi" : "DataForSEO"}
          </h2>
          <SerpFeatureSummary
            features={value}
            comparisonKinds={features.richFeatures?.map((x) => x.kind)}
          />
        </Card>
      ))}
    </div>
  ),
};

export const SavedRedirects: Story = {
  args: { features },
  render: () => (
    <Card className="min-w-0 overflow-hidden p-0">
      <h2 className="m-0 border-b border-border px-5 py-4 text-ui-section">DataForSEO</h2>
      <ResolveSerpUrls
        projectRef="prj_storyfixture"
        target={{ kind: "check", checkId: "check_storyfixture" }}
        onResolved={async () => undefined}
      />
      <SerpFeatureSummary features={features} />
    </Card>
  ),
};
