import { DomainOverviewWorkspace } from "@/components/domain-overview/DomainOverviewWorkspace";
import { estimateView } from "@/components/domain-overview/domain-overview-workspace-model";
import { PageContent } from "@/components/shell/PageContent";
import {
  analyzeDomainOverviewAction,
  loadDomainHistoryAction,
  loadDomainKeywordsPageAction,
  loadDomainPagesPageAction,
  saveSelectedKeywordsAction,
  selectDomainOverviewMarketAction,
} from "@/lib/actions/domain-overview";
import type { DomainOverviewScope } from "@/lib/domain-overview/types";
import { resolveProjectAccess } from "@/lib/queries/_auth";
import {
  getDomainOverviewMarket,
  getDomainOverviewPageContext,
} from "@/lib/queries/domain-overview";

type DomainOverviewPageProps = {
  params: Promise<{ project: string }>;
  searchParams: Promise<{ domain?: string | string[]; market?: string | string[]; scope?: string }>;
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
  const marketKey = first(query.market);
  const market = marketKey
    ? await getDomainOverviewMarket(publicId, marketKey)
    : context.defaultMarket;
  const target = first(query.domain)?.trim() ?? "";
  const scope: DomainOverviewScope | undefined =
    query.scope === "root" || query.scope === "subdomain" ? query.scope : undefined;
  const canLookup =
    context.providerStatus === "connected" && market?.locationCode != null && Boolean(target);
  let estimate = canLookup
    ? await analyzeDomainOverviewAction({
        estimateOnly: true,
        fresh: false,
        languageCode: market.languageCode,
        locationCode: market.locationCode,
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
          languageCode: market?.languageCode,
          locationCode: market?.locationCode,
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
      languageCode: market?.languageCode,
      locationCode: market?.locationCode,
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
        key={`${market?.canonicalKey ?? "none"}:${target}:${scope ?? "auto"}`}
        loadHistoryAction={loadDomainHistoryAction}
        loadKeywordsPageAction={loadDomainKeywordsPageAction}
        loadPagesPageAction={loadDomainPagesPageAction}
        market={market}
        projectId={publicId}
        projectRef={publicId}
        selectMarketAction={selectDomainOverviewMarketAction}
        saveSelectedKeywordsAction={saveSelectedKeywordsAction}
      />
    </PageContent>
  );
}
