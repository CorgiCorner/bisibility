import { AiTrackingClient } from "@/components/ai-tracking/AiTrackingClient";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { PageContent } from "@/components/shell/PageContent";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { getAiTrackingPage } from "@/lib/actions/ai-tracking";
import { asProjectRef } from "@/lib/routing/app-path";
import { projectSchedulesPath } from "@/lib/routing/project-schedules-path";
import { redirect } from "next/navigation";
export default async function AiTrackingPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ project: string }>;
  searchParams?: Promise<{ schedule?: string; tab?: string }>;
}>) {
  const [{ project }, query, runtime] = await Promise.all([
    params,
    searchParams,
    resolveRegionalDocumentLocale(),
  ]);
  // AI schedules moved to the common project Schedules page; keep old links working.
  if (query?.tab === "schedules") {
    const path = projectSchedulesPath(asProjectRef(project));
    redirect(
      typeof query.schedule === "string" && query.schedule
        ? `${path}?ai=${encodeURIComponent(query.schedule)}`
        : path,
    );
  }
  const [data, messages] = await Promise.all([
    getAiTrackingPage(project),
    loadCoreMessages(runtime.locale, ["shared", "projectAiTracking"]),
  ]);
  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      messages={messages}
      timeZone={runtime.timeZone}
    >
      <PageContent variant="section">
        <AiTrackingClient projectId={project} data={data} />
      </PageContent>
    </FeatureMessagesProvider>
  );
}
