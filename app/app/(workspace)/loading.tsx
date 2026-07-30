// Rendered in the content slot inside app/app/layout, so the sidebar + header stay
// put while a dashboard route's server data resolves. Gives instant feedback on
// navigation instead of a dead click (the global app/loading.tsx would replace the
// whole shell, which reads as a full reload). Shares OverviewSkeleton with the
// overview page's Suspense fallback so the two states are indistinguishable.

import { OverviewSkeleton } from "@/components/overview/OverviewSkeleton";
import { PageContent } from "@/components/shell/PageContent";

export default function AppLoading() {
  return (
    <PageContent>
      <OverviewSkeleton />
    </PageContent>
  );
}
