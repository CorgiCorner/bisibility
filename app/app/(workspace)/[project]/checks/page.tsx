import { ChecksWorkspace } from "@/components/checks/ChecksWorkspace";
import { PageContent } from "@/components/shell/PageContent";
import { providerLabel } from "@/lib/checks/attempts";
import { resolveProjectAccess } from "@/lib/queries/_auth";
import { getCheckRunsView, getUpcomingView } from "@/lib/queries/check-runs";
import { getRequestSerpProviderChain } from "@/lib/queries/workspace-request-data";

type ChecksPageProps = {
  params: Promise<{ project: string }>;
};

export default async function ChecksPage({ params }: Readonly<ChecksPageProps>) {
  const { project } = await params;
  const { projectId, publicId } = await resolveProjectAccess(project);
  const now = new Date();
  const [initialRuns, upcoming, providerChain] = await Promise.all([
    getCheckRunsView(publicId, { limit: 50, now, range: "7d", status: "all" }),
    getUpcomingView(publicId, { now }),
    getRequestSerpProviderChain(projectId),
  ]);

  return (
    <PageContent>
      <ChecksWorkspace
        initialRuns={initialRuns}
        key={`${publicId}:${now.toISOString()}`}
        now={now.toISOString()}
        projectId={publicId}
        projectRef={publicId}
        providerOptions={providerChain.map(({ provider }) => ({
          label: providerLabel(provider),
          value: provider,
        }))}
        upcoming={upcoming}
      />
    </PageContent>
  );
}
