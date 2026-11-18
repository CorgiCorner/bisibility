import { projectPagesPeriod } from "./period";
import type { ProjectPagesListInput } from "./types";
import type { ProjectPagesQuery } from "./url-state";
import { PROJECT_PAGES_PAGE_SIZE, type projectPagesLoadRequest } from "./url-state";

type ListRequest = Partial<Omit<ReturnType<typeof projectPagesLoadRequest>, "projectId">> &
  Pick<ProjectPagesQuery, "dir" | "page" | "period" | "sort">;
export function projectPagesListInput(query: ListRequest, now = new Date()): ProjectPagesListInput {
  const period = projectPagesPeriod(query.period, now);
  return {
    conversionSource: query.conv,
    coverageState: query.coverage,
    cwv: query.cwv,
    indexGroup: query.index,
    page: query.page,
    pageSize: PROJECT_PAGES_PAGE_SIZE,
    period: { from: period.from, to: period.to },
    search: query.search || undefined,
    sitemapState: query.sitemap,
    sort: { by: query.sort, dir: query.dir },
    source: query.source,
    status: query.status,
    tagId: query.tag,
  };
}
