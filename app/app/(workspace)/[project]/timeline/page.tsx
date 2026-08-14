import { PageContent } from "@/components/shell/PageContent";
import { TimelineFeed } from "@/components/timeline/TimelineFeed";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { getQueryActor, resolveProjectAccess } from "@/lib/queries/_auth";
import { getPreferences } from "@/lib/queries/account";
import { getTimelineView } from "@/lib/queries/timeline";

type TimelinePageProps = {
  params: Promise<{ project: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TimelinePage({
  params: routeParams,
  searchParams,
}: Readonly<TimelinePageProps>) {
  const { project } = await routeParams;
  const [{ projectId, publicId }, params, preferences, actor] = await Promise.all([
    resolveProjectAccess(project),
    searchParams,
    getPreferences(),
    getQueryActor(),
  ]);
  const role = getProjectRole(actor, projectId);
  const timeline = await getTimelineView(publicId, {
    filter: params?.filter,
    page: params?.page,
    q: params?.q,
  });

  return (
    <PageContent>
      <TimelineFeed
        canCreate={canProjectAction(role, "create", "signal")}
        canDelete={canProjectAction(role, "delete", "signal")}
        dateFormat={preferences.dateFormat}
        projectId={publicId}
        projectRef={publicId}
        view={timeline}
      />
    </PageContent>
  );
}
