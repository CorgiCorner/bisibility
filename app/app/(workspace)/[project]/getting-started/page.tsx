import { GettingStartedCompletion } from "@/components/getting-started/GettingStartedCompletion";
import { GettingStartedFirstCheckController } from "@/components/getting-started/GettingStartedFirstCheckController";
import { GettingStartedHeaderProgress } from "@/components/getting-started/GettingStartedHeaderProgress";
import { GoFurtherCards } from "@/components/getting-started/GoFurtherCards";
import { PageContent } from "@/components/shell/PageContent";
import { acknowledgeGettingStarted } from "@/lib/actions/getting-started";
import { runCheckNow } from "@/lib/actions/rankCheck";
import {
  isSetupAcknowledgedAt,
  loadSetupAcknowledgedAt,
} from "@/lib/getting-started/setup-acknowledgement";
import { resolveSetupProgress } from "@/lib/getting-started/setup-steps";
import { getQuerySession } from "@/lib/queries/_auth";
import { getCheckHealth } from "@/lib/queries/check-health";
import { getKeywordRows } from "@/lib/queries/keywords";
import { loadSetupContext } from "@/lib/queries/setup-context";

type GettingStartedPageProps = { params: Promise<{ project: string }> };

export default async function GettingStartedPage({ params }: Readonly<GettingStartedPageProps>) {
  const { project } = await params;
  const session = await getQuerySession();
  const [context, rows, checkHealth, setupAcknowledgedAt] = await Promise.all([
    loadSetupContext(project),
    getKeywordRows(project),
    getCheckHealth(project),
    loadSetupAcknowledgedAt(session.user.id, project),
  ]);
  const progress = resolveSetupProgress(context);
  const completed = progress.completed;
  const acknowledged = completed && isSetupAcknowledgedAt(setupAcknowledgedAt);

  return (
    <PageContent variant="constrained" className="grid gap-5">
      <GettingStartedHeaderProgress
        completionMode={acknowledged ? "state-b" : "state-a"}
        progress={progress}
        projectRef={project}
      />
      {completed ? (
        <>
          <GettingStartedCompletion
            acknowledged={acknowledged}
            onAcknowledge={acknowledgeGettingStarted}
            projectRef={project}
          />
          <GoFurtherCards projectRef={project} />
        </>
      ) : (
        <GettingStartedFirstCheckController
          context={context}
          now={new Date()}
          providerRate={checkHealth.providerRate}
          rows={rows}
          runCheckNowAction={runCheckNow}
        />
      )}
    </PageContent>
  );
}
