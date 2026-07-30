import { BacklinksWorkspace } from "@/components/backlinks/BacklinksWorkspace";
import { PageContent } from "@/components/shell/PageContent";
import { analyzeBacklinksAction, loadMoreBacklinkRowsAction } from "@/lib/actions/backlinks";
import { resolveProjectAccess } from "@/lib/queries/_auth";
import { getBacklinksPageContext } from "@/lib/queries/backlinks";

type BacklinksPageProps = {
  params: Promise<{ project: string }>;
};

export default async function BacklinksPage({ params }: Readonly<BacklinksPageProps>) {
  const { project } = await params;
  const { publicId } = await resolveProjectAccess(project);

  const context = await getBacklinksPageContext(publicId);
  const suggestedEstimate = await analyzeBacklinksAction({
    estimateOnly: true,
    includeSubdomains: true,
    mode: "as_is",
    projectId: publicId,
    resultLimit: 100,
    target: context.defaultTarget,
    targetScope: "site",
  }).catch(() => null);
  const suggestedEstimateCents =
    suggestedEstimate?.ok === true
      ? (suggestedEstimate.estimatedCostCents ?? suggestedEstimate.costCents)
      : null;

  return (
    <PageContent>
      <BacklinksWorkspace
        analyzeAction={analyzeBacklinksAction}
        context={context}
        loadMoreAction={loadMoreBacklinkRowsAction}
        projectId={publicId}
        suggestedEstimateCents={suggestedEstimateCents}
      />
    </PageContent>
  );
}
