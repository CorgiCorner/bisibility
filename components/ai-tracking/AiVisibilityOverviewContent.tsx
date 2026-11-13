import { AiVisibilityOverview } from "@/components/ai-tracking/AiVisibilityOverview";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { PageContent } from "@/components/shell/PageContent";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { getAiVisibilityEnabledEngines } from "@/lib/actions/ai-project-engines";
import { getAiVisibilityOverview } from "@/lib/actions/ai-visibility-overview";
import { getProjectBrandNames } from "@/lib/actions/brand-names";
import type { AiVisibilityQuery } from "@/lib/ai-tracking/ai-visibility-paths";
import {
  aiVisibilityComposeHref,
  aiVisibilityRegisteredHref,
} from "@/lib/ai-tracking/ai-visibility-paths";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import { projectSchedulesPath } from "@/lib/routing/project-schedules-path";

export async function AiVisibilityOverviewContent({
  project,
  query,
}: Readonly<{ project: string; query: AiVisibilityQuery }>) {
  const runtime = await resolveRegionalDocumentLocale();
  const [model, messages, brandNames, enabledEngines] = await Promise.all([
    getAiVisibilityOverview(project, query, runtime.timeZone),
    loadCoreMessages(runtime.locale, ["shared", "projectAiTracking"]),
    getProjectBrandNames(project),
    getAiVisibilityEnabledEngines(project),
  ]);
  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      messages={messages}
      timeZone={runtime.timeZone}
    >
      <PageContent variant="section">
        <AiVisibilityOverview
          brandNames={brandNames}
          enabledEngines={enabledEngines}
          hrefs={{
            addPrompt: aiVisibilityComposeHref(project, "prompt"),
            competitors: appPath(asProjectRef(project), "settings", "competitors"),
            engines: aiVisibilityRegisteredHref(project, "engines"),
            run: aiVisibilityComposeHref(project, "run"),
            schedules: projectSchedulesPath(asProjectRef(project)),
            sources: aiVisibilityRegisteredHref(project, "sources"),
          }}
          model={model}
          projectId={project}
        />
      </PageContent>
    </FeatureMessagesProvider>
  );
}
