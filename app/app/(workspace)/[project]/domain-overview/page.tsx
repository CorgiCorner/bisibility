import { DomainOverviewWorkspace } from "@/components/domain-overview/DomainOverviewWorkspace";
import { estimateView } from "@/components/domain-overview/domain-overview-workspace-model";
import { PageContent } from "@/components/shell/PageContent";
import {
  analyzeDomainOverviewAction,
  loadDomainHistoryAction,
  loadDomainKeywordsPageAction,
  loadDomainPagesPageAction,
  saveSelectedKeywordsAction,
} from "@/lib/actions/domain-overview";
import type { DomainOverviewScope } from "@/lib/domain-overview/types";
import { resolveProjectAccess } from "@/lib/queries/_auth";
import { getDomainOverviewPageContext } from "@/lib/queries/domain-overview";
import { researchScopeKey } from "@/lib/research/scope";

type DomainOverviewPageProps = {
  params: Promise<{ project: string }>;
  searchParams: Promise<{
    domain?: string | string[];
    researchScope?: string | string[];
    scope?: string;
  }>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DomainOverviewPage({
  params,
  searchParams,
}: Readonly<DomainOverviewPageProps>) {
  const [{ project }, query] = await Promise.all([params, searchParams]);
  const { publicId } = await resolveProjectAccess(project);
  const context = await getDomainOverviewPageContext(publicId);
  const requestedScope = first(query.researchScope);
  const researchScope = requestedScope
    ? ([context.defaultScope, ...context.trackedScopes, ...context.catalogScopes].find(
        (scope) => scope && researchScopeKey(scope) === requestedScope,
      ) ?? context.defaultScope)
    : context.defaultScope;
  const target = first(query.domain)?.trim() ?? "";
  const scope: DomainOverviewScope | undefined =
    query.scope === "root" || query.scope === "subdomain" ? query.scope : undefined;
  const canLookup =
    context.providerStatus === "connected" &&
    researchScope?.providerLocationCode != null &&
    Boolean(target);
  let estimate = canLookup
    ? await analyzeDomainOverviewAction({
        estimateOnly: true,
        fresh: false,
        countryCode: researchScope.countryCode,
        languageCode: researchScope.languageCode,
        locationCode: researchScope.providerLocationCode,
        projectId: publicId,
        scopeOverride: scope,
        target,
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
          scopeOverride: scope,
          target,
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
      scopeOverride: scope,
      target,
    }).catch(() => null);
  }

  return (
    <PageContent>
      <DomainOverviewWorkspace
        analyzeAction={analyzeDomainOverviewAction}
        context={context}
        initialEstimate={estimateView(estimate)}
        initialOutcome={initialOutcome}
        initialScope={scope}
        initialTarget={target}
        key={`${researchScope ? researchScopeKey(researchScope) : "none"}:${target}:${scope ?? "auto"}`}
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
