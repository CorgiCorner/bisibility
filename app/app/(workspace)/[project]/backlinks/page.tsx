import { BacklinksWorkspace } from "@/components/backlinks/BacklinksWorkspace";
import { PageContent } from "@/components/shell/PageContent";
import { analyzeBacklinksAction, loadMoreBacklinkRowsAction } from "@/lib/actions/backlinks";
import { resolveProjectAccess } from "@/lib/queries/_auth";
import { getBacklinksPageContext } from "@/lib/queries/backlinks";

type BacklinksPageProps = {
  params: Promise<{ project: string }>;
  searchParams: Promise<{ target?: string | string[] }>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function BacklinksPage({
  params,
  searchParams,
}: Readonly<BacklinksPageProps>) {
  const [{ project }, query] = await Promise.all([params, searchParams]);
  const { publicId } = await resolveProjectAccess(project);

  const context = await getBacklinksPageContext(publicId);
  const initialTarget = first(query.target)?.trim() ?? "";
  const estimateTarget = initialTarget || context.defaultTarget;
  const suggestedEstimate = await analyzeBacklinksAction({
    estimateOnly: true,
    includeSubdomains: true,
    mode: "as_is",
    projectId: publicId,
    resultLimit: 100,
    target: estimateTarget,
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
        initialEstimate={
          initialTarget
            ? {
                cached: suggestedEstimate?.ok === true && suggestedEstimate.cached,
                costCents: suggestedEstimateCents,
                loading: false,
                valid: suggestedEstimate?.ok === true,
              }
            : undefined
        }
        initialTarget={initialTarget}
        loadMoreAction={loadMoreBacklinkRowsAction}
        projectId={publicId}
        suggestedEstimateCents={suggestedEstimateCents}
      />
    </PageContent>
  );
}
