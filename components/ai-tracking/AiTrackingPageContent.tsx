import { AiTrackingClient } from "@/components/ai-tracking/AiTrackingClient";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { PageContent } from "@/components/shell/PageContent";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { getAiTrackingPage } from "@/lib/actions/ai-tracking";
import { getAiVisibilityPromptAnswers } from "@/lib/actions/ai-visibility-prompts";
import type { AiVisibilityQuery } from "@/lib/ai-tracking/ai-visibility-paths";
import { promptsStateFromQuery } from "@/lib/ai-tracking/prompts-model";
import { aiVisibilityPromptsModel } from "@/lib/ai-tracking/prompts-page-model";
import { trackingEnginePriceCard } from "@/lib/ai-tracking/tracking-engine-prices";

export async function AiTrackingPageContent({
  initialDrawer = null,
  initialTab = "prompts",
  moduleTabs = false,
  project,
  query = {},
}: Readonly<{
  initialDrawer?: "prompt" | "run" | null;
  initialTab?: "prompts" | "runs";
  moduleTabs?: boolean;
  project: string;
  query?: AiVisibilityQuery;
}>) {
  const runtime = await resolveRegionalDocumentLocale();
  const observedAt = new Date();
  const loadPrompts = moduleTabs && initialTab === "prompts";
  const [data, messages, answers] = await Promise.all([
    getAiTrackingPage(project),
    loadCoreMessages(runtime.locale, ["shared", "projectAiTracking"]),
    loadPrompts ? getAiVisibilityPromptAnswers(project, query) : Promise.resolve(null),
  ]);
  const model =
    answers === null
      ? null
      : aiVisibilityPromptsModel({
          answers,
          now: observedAt,
          prompts: data.prompts,
          schedules: data.schedules,
          selectedPromptId: promptsStateFromQuery(query).promptId,
          timeZone: runtime.timeZone,
        });
  const enginePrices = trackingEnginePriceCard();
  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      messages={messages}
      timeZone={runtime.timeZone}
    >
      <PageContent variant="section">
        <AiTrackingClient
          data={data}
          enginePrices={enginePrices}
          initialDrawer={initialDrawer}
          initialTab={initialTab}
          model={model}
          moduleTabs={moduleTabs}
          projectId={project}
        />
      </PageContent>
    </FeatureMessagesProvider>
  );
}
