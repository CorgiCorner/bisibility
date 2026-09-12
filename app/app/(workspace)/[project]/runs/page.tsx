import {
  ProjectRunsContent,
  ProjectRunsLoadError,
} from "@/components/project-runs/ProjectRunsContent";
import {
  deleteProjectRun,
  runPlannedProjectRunNow,
  skipPlannedProjectRun,
} from "@/components/project-runs/project-runs-actions";
import { PageContent } from "@/components/shell/PageContent";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { isProjectReadOnly } from "@/lib/deployment/project-write-mode";
import { requireReadableProject, resolveProjectAccess } from "@/lib/queries/_auth";
import { readOperationSnapshot } from "@/lib/rank-check/runs/snapshot";
import { projectRunsPath } from "@/lib/routing/project-runs-path";
import { ProjectRunsCursorError } from "@/lib/runs/cursor";
import { type ProjectRunsQuery, parseProjectRunsQuery } from "@/lib/runs/filters";
import { listProjectRuns } from "@/lib/runs/project-runs-query";
import { redirect } from "next/navigation";
import { ZodError } from "zod";

type SearchParamValue = string | string[] | undefined;

type RunsPageProps = {
  params: Promise<{ project: string }>;
  searchParams: Promise<Record<string, SearchParamValue>>;
};

function toUrlSearchParams(input: Record<string, SearchParamValue>) {
  const result = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    for (const entry of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      result.append(key, entry);
    }
  }
  return result;
}

export default async function RunsPage({ params, searchParams }: Readonly<RunsPageProps>) {
  const [{ project }, rawSearchParams] = await Promise.all([params, searchParams]);
  const access = await resolveProjectAccess(project);
  let query: ProjectRunsQuery;
  try {
    query = parseProjectRunsQuery(toUrlSearchParams(rawSearchParams));
  } catch (error) {
    return (
      <PageContent>
        <ProjectRunsLoadError projectRef={access.publicId} stale={error instanceof ZodError} />
      </PageContent>
    );
  }

  if (query.view === "planned" && query.status !== "all") {
    redirect(projectRunsPath(access.publicId, { ...query, cursor: null, status: "all" }));
  }

  const readable = await requireReadableProject(access.publicId);
  const canMutate =
    canProjectAction(getProjectRole(readable.actor, readable.project.id), "update", "keyword") &&
    !isProjectReadOnly(readable.project.writeMode);
  try {
    const [page, operations] = await Promise.all([
      listProjectRuns(
        { id: access.projectId, name: readable.project.name, publicId: access.publicId },
        query,
      ),
      readOperationSnapshot(access.projectId),
    ]);
    return (
      <PageContent>
        <ProjectRunsContent
          canMutate={canMutate}
          canDelete={
            canMutate &&
            canProjectAction(
              getProjectRole(readable.actor, readable.project.id),
              "delete",
              "keyword",
            )
          }
          deleteAction={deleteProjectRun}
          operations={operations}
          page={page}
          projectRef={access.publicId}
          query={query}
          runNowAction={runPlannedProjectRunNow}
          skipAction={skipPlannedProjectRun}
        />
      </PageContent>
    );
  } catch (error) {
    return (
      <PageContent>
        <ProjectRunsLoadError
          projectRef={access.publicId}
          query={query}
          stale={error instanceof ProjectRunsCursorError}
        />
      </PageContent>
    );
  }
}
