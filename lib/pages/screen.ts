import "server-only";

import { loadPagesCompare } from "./compare-read";
import { projectPagesListInput } from "./list-input";
import { projectPagesPeriod } from "./period";
import { getProjectPageSources, getProjectPagesList } from "./queries";
import { getActivePageSnapshot, loadExistingVsNew } from "./snapshot-read";
import { syncProjectPages } from "./sync";
import { getProjectPageTagView } from "./tag-queries";
import type { ProjectPagesListInput } from "./types";
import type { ProjectPagesQuery } from "./url-state";

export { projectPagesListInput } from "./list-input";

function narrowed(input: ProjectPagesListInput) {
  return Boolean(
    input.search ||
      input.indexGroup ||
      input.coverageState ||
      input.cwv ||
      input.source ||
      input.tagId,
  );
}

export async function loadProjectPagesScreen(
  projectId: string,
  query: ProjectPagesQuery,
  options: { now?: Date; syncIfEmpty: boolean },
) {
  const now = options.now ?? new Date();
  const input = projectPagesListInput(query, now);
  let list = await getProjectPagesList(projectId, input);
  if (options.syncIfEmpty && (await registryIsEmpty(projectId, input, list.counts.all))) {
    await syncProjectPages(projectId, { now });
    list = await getProjectPagesList(projectId, input);
  }
  const [sources, tags, snapshot] = await Promise.all([
    getProjectPageSources(projectId),
    getProjectPageTagView(projectId),
    getActivePageSnapshot(projectId),
  ]);
  const comparison =
    query.tab === "existing-vs-new"
      ? await loadExistingVsNew(projectId, {
          conversionSource: query.conv,
          metric: query.metric,
          now,
          span: query.span,
          tagId: query.tag,
        })
      : null;
  const compare =
    query.tab === "compare"
      ? await loadPagesCompare(projectId, {
          annotationId: query.annotation,
          changedTagId: query.changed,
          metric: query.compareMetric,
          now,
          unchangedTagId: query.unchanged,
        })
      : null;
  return {
    compare,
    comparison,
    list,
    period: projectPagesPeriod(query.period, now),
    snapshot,
    sources,
    tags,
  };
}

async function registryIsEmpty(projectId: string, input: ProjectPagesListInput, visible: number) {
  if (!narrowed(input)) return visible === 0;
  if (visible > 0) return false;
  const probe = await getProjectPagesList(projectId, {
    ...input,
    coverageState: undefined,
    cwv: undefined,
    indexGroup: undefined,
    page: 1,
    search: undefined,
    source: undefined,
    tagId: undefined,
  });
  return probe.counts.all === 0;
}
