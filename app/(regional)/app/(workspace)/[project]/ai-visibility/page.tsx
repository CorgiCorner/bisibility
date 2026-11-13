import { AiTrackingPageContent } from "@/components/ai-tracking/AiTrackingPageContent";
import { AiVisibilityEnginesContent } from "@/components/ai-tracking/AiVisibilityEnginesContent";
import { AiVisibilityOverviewContent } from "@/components/ai-tracking/AiVisibilityOverviewContent";
import { AiVisibilitySourcesContent } from "@/components/ai-tracking/AiVisibilitySourcesContent";
import { PromptResearchPageContent } from "@/components/ai-tracking/PromptResearchPageContent";
import { ResearchBrandLookup } from "@/components/ai-tracking/ResearchBrandLookup";
import { firstQueryValue } from "@/lib/ai-tracking/ai-visibility-paths";
import {
  resolveAiVisibilityTab,
  trackingViewFromQuery,
} from "@/lib/ai-tracking/ai-visibility-tabs";

export const maxDuration = 300;

export default async function AiVisibilityPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ project: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const [{ project }, query] = await Promise.all([params, searchParams]);
  const tab = resolveAiVisibilityTab(firstQueryValue(query?.tab));
  if (tab === "overview") {
    return <AiVisibilityOverviewContent project={project} query={query ?? {}} />;
  }
  if (tab === "sources") {
    return <AiVisibilitySourcesContent project={project} query={query ?? {}} />;
  }
  if (tab === "engines") {
    return <AiVisibilityEnginesContent project={project} />;
  }
  if (tab === "research" && firstQueryValue(query?.view) === "brand") {
    return <ResearchBrandLookup project={project} />;
  }
  if (tab === "research") {
    const keyword = firstQueryValue(query?.q)?.trim() ?? "";
    return <PromptResearchPageContent keyword={keyword} moduleTabs project={project} />;
  }
  const compose = firstQueryValue(query?.compose);
  return (
    <AiTrackingPageContent
      initialDrawer={compose === "run" || compose === "prompt" ? compose : null}
      initialTab={trackingViewFromQuery(firstQueryValue(query?.view))}
      moduleTabs
      project={project}
      query={query ?? {}}
    />
  );
}
