import { StoredBacklinksView } from "@/components/demo-research/StoredBacklinksView";
import { StoredResultSelector } from "@/components/demo-research/StoredResultSelector";
import { PageContent } from "@/components/shell/PageContent";
import { listDemoBacklinksAction, readDemoBacklinksAction } from "@/lib/actions/demo-research";
import { getDemoResearchAccess } from "@/lib/queries/demo-research";
import Link from "next/link";

type BacklinksPageProps = {
  params: Promise<{ project: string }>;
  searchParams: Promise<{
    demoManage?: string | string[];
    saved?: string | string[];
    target?: string | string[];
  }>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function savedKey(item: {
  includeSubdomains: boolean;
  mode: string;
  target: string;
  targetScope: string;
}) {
  return [item.target, item.targetScope, item.mode, item.includeSubdomains ? "1" : "0"].join("|");
}

export default async function BacklinksPage({
  params,
  searchParams,
}: Readonly<BacklinksPageProps>) {
  const [{ project }, query] = await Promise.all([params, searchParams]);
  const demo = await getDemoResearchAccess(project);
  const demoManage = first(query.demoManage) === "1";

  if (demo && !(demo.actorKind === "owner" && demoManage)) {
    const saved = await listDemoBacklinksAction({ projectId: demo.project.publicId });
    const selected =
      saved.find((item) => savedKey(item) === first(query.saved)) ??
      saved.find((item) => item.target === first(query.target)?.trim().toLowerCase()) ??
      saved[0];
    const result = selected
      ? await readDemoBacklinksAction({
          includeSubdomains: selected.includeSubdomains,
          mode: selected.mode,
          projectId: demo.project.publicId,
          target: selected.target,
          targetScope: selected.targetScope,
        })
      : null;

    return (
      <PageContent>
        <section className="grid min-w-0 gap-4">
          <StoredResultSelector
            actorKind={demo.actorKind}
            options={saved.map((item) => ({
              label: `${item.target} - ${item.targetScope}${item.includeSubdomains ? ", subdomains" : ""}`,
              value: savedKey(item),
            }))}
            selectedValue={selected ? savedKey(selected) : undefined}
            title="Backlinks"
          />
          <StoredBacklinksView result={result} />
        </section>
      </PageContent>
    );
  }

  const [
    { BacklinksWorkspace },
    { analyzeBacklinksAction, loadMoreBacklinkRowsAction },
    { resolveProjectAccess },
    { getBacklinksPageContext },
  ] = await Promise.all([
    import("@/components/backlinks/BacklinksWorkspace"),
    import("@/lib/actions/backlinks"),
    import("@/lib/queries/_auth"),
    import("@/lib/queries/backlinks"),
  ]);
  const { publicId } = await resolveProjectAccess(project);
  const context = await getBacklinksPageContext(publicId);
  const initialTarget = first(query.target)?.trim() ?? "";
  const initialEstimateOutcome = initialTarget
    ? await analyzeBacklinksAction({
        estimateOnly: true,
        includeSubdomains: true,
        mode: "as_is",
        projectId: publicId,
        resultLimit: 100,
        target: initialTarget,
        targetScope: "site",
      }).catch(() => null)
    : null;
  const initialEstimateCents =
    initialEstimateOutcome?.ok === true
      ? (initialEstimateOutcome.estimatedCostCents ?? initialEstimateOutcome.costCents)
      : null;

  return (
    <PageContent>
      {demo ? (
        <Link className="mb-3 inline-flex font-semibold text-accent-text hover:underline" href="?">
          Back to saved results
        </Link>
      ) : null}
      <BacklinksWorkspace
        analyzeAction={analyzeBacklinksAction}
        context={context}
        initialEstimate={
          initialTarget
            ? {
                cached: initialEstimateOutcome?.ok === true && initialEstimateOutcome.cached,
                costCents: initialEstimateCents,
                loading: false,
                valid: initialEstimateOutcome?.ok === true,
              }
            : undefined
        }
        initialTarget={initialTarget}
        loadMoreAction={loadMoreBacklinkRowsAction}
        projectId={publicId}
      />
    </PageContent>
  );
}
