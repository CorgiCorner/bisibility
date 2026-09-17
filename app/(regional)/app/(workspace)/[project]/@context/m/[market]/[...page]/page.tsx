import { RankTrackerHeaderContext } from "@/components/keywords/RankTrackerHeaderContext";
import { HeaderContextSlot } from "@/components/shell/HeaderContextSlot";
import { type NextSearchParams, parseRankTrackerQuery } from "@/lib/keywords/rank-tracker-query";
import { resolveProjectAccess } from "@/lib/queries/_auth";
import { listHeaderMarkets } from "@/lib/queries/header-markets";
import { getSavedView } from "@/lib/queries/saved-views";

type HeaderContextRouteProps = {
  params: Promise<{ market: string; page: string[]; project: string }>;
  searchParams?: Promise<NextSearchParams>;
};

/**
 * The header context slot as a ROUTE, not a prop.
 *
 * The chrome that shows the switcher is mounted by the project layout, one level ABOVE the
 * market segment, so the market level cannot hand anything up to it. A parallel slot is matched
 * against the URL on its own and re-rendered on every navigation, which makes it the one way to
 * feed that chrome from the market level without a client fetch or an effect - and the one way
 * to keep the read off the project-scoped routes, where the slot renders nothing at all.
 *
 * The catch-all mirrors the market subtree it shadows: every market section and the
 * scope-correcting fallback resolve to this one slot. It is deliberately NOT optional - Next
 * refuses to collect page data for an optional catch-all here - and it loses nothing, because
 * `m/{market}` on its own has no page either and answers 404 rather than rendering chrome. The
 * engine axis brings its own slot page the day it has a producer; until then no URL reaches
 * one and none is written.
 */
export default async function HeaderContextRoute({
  params,
  searchParams,
}: Readonly<HeaderContextRouteProps>) {
  const { page, project } = await params;
  // Request-cached, so this costs nothing: the project layout resolved the same ref already.
  const access = await resolveProjectAccess(project);
  const contexts = await listHeaderMarkets(access.publicId);

  const rankTracker = page.length === 1 && page[0] === "rank-tracker";
  const viewId = rankTracker
    ? parseRankTrackerQuery((await searchParams) ?? {}).state.savedViewId
    : null;
  const savedView = viewId ? await getSavedView(access.publicId, viewId) : null;
  return rankTracker ? (
    <RankTrackerHeaderContext
      contexts={contexts}
      projectRef={access.publicId}
      savedView={savedView?.config}
    />
  ) : (
    <HeaderContextSlot contexts={contexts} projectRef={access.publicId} />
  );
}
