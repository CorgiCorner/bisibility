import { CheckSummaryDetails } from "@/components/checks/summaries/CheckSummaryDetails";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { PageContent } from "@/components/shell/PageContent";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { readCheckSummaryDetails } from "@/lib/notifications/check-summaries/details";
import { requireReadableProject, resolveProjectAccess } from "@/lib/queries/_auth";
import { notFound } from "next/navigation";

export default async function CheckSummaryPage({
  params,
}: Readonly<{
  params: Promise<{ project: string; notificationPublicId: string }>;
}>) {
  const { project: ref, notificationPublicId } = await params;
  const access = await resolveProjectAccess(ref);
  const { actor, project } = await requireReadableProject(access.publicId);
  const details = await readCheckSummaryDetails(
    project.id,
    project.publicId,
    actor.id,
    notificationPublicId,
  );
  if (!details) notFound();
  const runtime = await resolveRegionalDocumentLocale();
  const messages = await loadCoreMessages(runtime.locale, [
    "shared",
    "projectRuns",
    "projectRankTracker",
  ]);
  return (
    <FeatureMessagesProvider {...runtime} messages={messages}>
      <PageContent>
        <CheckSummaryDetails details={details} projectRef={project.publicId} />
      </PageContent>
    </FeatureMessagesProvider>
  );
}
