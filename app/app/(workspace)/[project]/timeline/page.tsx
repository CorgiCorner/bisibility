import { PageContent } from "@/components/shell/PageContent";
import { TimelineFeed } from "@/components/timeline/TimelineFeed";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { getQueryActor, resolveProjectAccess } from "@/lib/queries/_auth";
import { getPreferences } from "@/lib/queries/account";
import { getExperimentalModules } from "@/lib/queries/experimental-modules";
import { getTimelineView } from "@/lib/queries/timeline";
import { hasExperimentalModule } from "@/lib/settings/experimental-modules";
import { notFound } from "next/navigation";

type TimelinePageProps = {
  params: Promise<{ project: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TimelinePage({
  params: routeParams,
  searchParams,
}: Readonly<TimelinePageProps>) {
  const { project } = await routeParams;
  const access = await resolveProjectAccess(project);
  const enabledExperimentalModules = await getExperimentalModules(access.publicId);
  if (!hasExperimentalModule(enabledExperimentalModules, "timeline")) {
    notFound();
  }
  const [params, preferences, actor] = await Promise.all([
    searchParams,
    getPreferences(),
    getQueryActor(),
  ]);
  const role = getProjectRole(actor, access.projectId);
  const timeline = await getTimelineView(access.publicId, {
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
        projectId={access.publicId}
        projectRef={access.publicId}
        view={timeline}
      />
    </PageContent>
  );
}
