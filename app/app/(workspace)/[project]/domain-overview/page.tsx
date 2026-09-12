import { StoredDomainOverviewView } from "@/components/demo-research/StoredDomainOverviewView";
import { StoredResultSelector } from "@/components/demo-research/StoredResultSelector";
import { PageContent } from "@/components/shell/PageContent";
import {
  listDemoDomainOverviewsAction,
  readDemoDomainOverviewAction,
} from "@/lib/actions/demo-research";
import { getDemoResearchAccess } from "@/lib/queries/demo-research";
import Link from "next/link";

type DomainOverviewPageProps = {
  params: Promise<{ project: string }>;
  searchParams: Promise<{
    demoManage?: string | string[];
    domain?: string | string[];
    researchScope?: string | string[];
    saved?: string | string[];
    scope?: string | string[];
  }>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function savedKey(item: {
  languageCode: string;
  locationCode: number;
  scope: string;
  target: string;
}) {
  return [item.target, item.scope, item.locationCode, item.languageCode].join("|");
}

export default async function DomainOverviewPage({
  params,
  searchParams,
}: Readonly<DomainOverviewPageProps>) {
  const [{ project }, query] = await Promise.all([params, searchParams]);
  const demo = await getDemoResearchAccess(project);
  const demoManage = first(query.demoManage) === "1";

  if (demo && !(demo.actorKind === "owner" && demoManage)) {
    const saved = await listDemoDomainOverviewsAction({ projectId: demo.project.publicId });
    const target = first(query.domain)?.trim().toLowerCase();
    const requestedScope = first(query.scope);
    const scope =
      requestedScope === "root" || requestedScope === "subdomain" ? requestedScope : undefined;
    const selected =
      saved.find((item) => savedKey(item) === first(query.saved)) ??
      saved.find((item) => item.target === target && (!scope || item.scope === scope)) ??
      saved[0];
    const result = selected
      ? await readDemoDomainOverviewAction({
          languageCode: selected.languageCode,
          locationCode: selected.locationCode,
          projectId: demo.project.publicId,
          scope: selected.scope,
          target: selected.target,
        })
      : null;

    return (
      <PageContent>
        <section className="grid min-w-0 gap-4">
          <StoredResultSelector
            actorKind={demo.actorKind}
            options={saved.map((item) => ({
              label: `${item.target} - ${item.languageCode.toUpperCase()} / ${item.locationCode}${item.stale ? " (past refresh window)" : ""}`,
              value: savedKey(item),
            }))}
            selectedValue={selected ? savedKey(selected) : undefined}
            title="Domain Overview"
          />
          <StoredDomainOverviewView result={result} />
        </section>
      </PageContent>
    );
  }

  const [
    { DomainOverviewWorkspace },
    { estimateView },
    {
      analyzeDomainOverviewAction,
      loadDomainHistoryAction,
      loadDomainKeywordsPageAction,
      loadDomainPagesPageAction,
      saveSelectedKeywordsAction,
    },
    { resolveProjectAccess },
    { getDomainOverviewPageContext },
    { researchScopeKey },
  ] = await Promise.all([
    import("@/components/domain-overview/DomainOverviewWorkspace"),
    import("@/components/domain-overview/domain-overview-workspace-model"),
    import("@/lib/actions/domain-overview"),
    import("@/lib/queries/_auth"),
    import("@/lib/queries/domain-overview"),
    import("@/lib/research/scope"),
  ]);
  const { publicId } = await resolveProjectAccess(project);
  const context = await getDomainOverviewPageContext(publicId);
  const requestedScope = first(query.researchScope);
  const researchScope = requestedScope
    ? ([context.defaultScope, ...context.trackedScopes, ...context.catalogScopes].find(
        (item) => item && researchScopeKey(item) === requestedScope,
      ) ?? context.defaultScope)
    : context.defaultScope;
  const normalTarget = first(query.domain)?.trim() ?? "";
  const requestedNormalScope = first(query.scope);
  const normalScope =
    requestedNormalScope === "root" || requestedNormalScope === "subdomain"
      ? requestedNormalScope
      : undefined;
  const canLookup =
    context.providerStatus === "connected" &&
    researchScope?.providerLocationCode != null &&
    Boolean(normalTarget);
  let estimate = canLookup
    ? await analyzeDomainOverviewAction({
        estimateOnly: true,
        fresh: false,
        countryCode: researchScope.countryCode,
        languageCode: researchScope.languageCode,
        locationCode: researchScope.providerLocationCode,
        projectId: publicId,
        scopeOverride: normalScope,
        target: normalTarget,
      }).catch(() => null)
    : null;
  const initialOutcome =
    estimate?.ok && "estimate" in estimate && estimate.cached
      ? await analyzeDomainOverviewAction({
          estimateOnly: false,
          fresh: false,
          countryCode: researchScope?.countryCode,
          languageCode: researchScope?.languageCode,
          locationCode: researchScope?.providerLocationCode,
          maxCostCents: 0,
          projectId: publicId,
          scopeOverride: normalScope,
          target: normalTarget,
        }).catch(() => null)
      : null;
  if (
    initialOutcome?.ok === false &&
    (initialOutcome.reason === "cost_limit_exceeded" ||
      initialOutcome.reason === "snapshot_expired")
  ) {
    estimate = await analyzeDomainOverviewAction({
      estimateOnly: true,
      fresh: false,
      countryCode: researchScope?.countryCode,
      languageCode: researchScope?.languageCode,
      locationCode: researchScope?.providerLocationCode,
      projectId: publicId,
      scopeOverride: normalScope,
      target: normalTarget,
    }).catch(() => null);
  }

  return (
    <PageContent>
      {demo ? (
        <Link className="mb-3 inline-flex font-semibold text-accent-text hover:underline" href="?">
          Back to saved results
        </Link>
      ) : null}
      <DomainOverviewWorkspace
        analyzeAction={analyzeDomainOverviewAction}
        context={context}
        initialEstimate={estimateView(estimate)}
        initialOutcome={initialOutcome}
        initialScope={normalScope}
        initialTarget={normalTarget}
        key={`${researchScope ? researchScopeKey(researchScope) : "none"}:${normalTarget}:${normalScope ?? "auto"}`}
        loadHistoryAction={loadDomainHistoryAction}
        loadKeywordsPageAction={loadDomainKeywordsPageAction}
        loadPagesPageAction={loadDomainPagesPageAction}
        projectId={publicId}
        projectRef={publicId}
        researchScope={researchScope}
        saveSelectedKeywordsAction={saveSelectedKeywordsAction}
      />
    </PageContent>
  );
}
