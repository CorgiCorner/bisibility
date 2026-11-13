import type { OverviewFilters } from "@/lib/ai-tracking/overview-model";
import type {
  AiSourcePlanRow,
  AiSourceRow,
  AiVisibilitySourcesLoad,
} from "@/lib/ai-tracking/sources-model";

const filters: OverviewFilters = {
  engine: null,
  market: null,
  period: "30d",
  promptKind: "all",
  topic: null,
};

function domainRow(
  domain: string,
  type: AiSourceRow["type"],
  origin: AiSourceRow["origin"],
  links: number,
  planState: AiSourceRow["planState"] = null,
): AiSourceRow {
  return {
    answers: 1,
    domain,
    id: domain,
    links,
    origin,
    planState,
    type,
    url: null,
  };
}

const rows: AiSourceRow[] = [
  domainRow("acme.example.com", "you", "you", 3),
  domainRow("directory.example.org", "directory", "catalog", 2),
  domainRow("north.example.org", "competitor", "competitor", 2),
  domainRow("notes.example.com", "unsorted", "unsorted", 1),
];

const pages: AiSourceRow[] = [
  {
    ...domainRow("directory.example.org", "directory", "catalog", 2),
    id: "https://directory.example.org/list",
    url: "https://directory.example.org/list",
  },
];

const plan: AiSourcePlanRow[] = [
  {
    domain: "directory.example.org",
    note: "Ask for a listing",
    state: "todo",
    type: "directory",
    url: "https://directory.example.org/list",
  },
  {
    domain: "reviews.example.com",
    note: null,
    state: "done",
    type: "reviews",
    url: null,
  },
];

function model(
  sources: AiVisibilitySourcesLoad["sources"],
  hasAnswers = true,
): AiVisibilitySourcesLoad {
  return {
    canWrite: true,
    engines: ["chat_gpt"],
    filters,
    hasAnswers,
    markets: [{ key: "n:United%20States:en", label: "United States · English" }],
    sources,
    topics: [{ id: "ait_abcdefghijklmnopqrstuvwx", name: "Catalogs" }],
  };
}

const baseSources = {
  citedDomains: 4,
  limit: 2000,
  pages,
  plan: [] as AiSourcePlanRow[],
  rows,
  totalAnswers: 2,
  truncated: false,
  unnamedOtherDomains: 8,
  withoutNameLinks: 0,
  yourSite: { allNamed: true, links: 3, unnamedLinks: 0 },
};

export function sourcesDataFixture(): AiVisibilitySourcesLoad {
  return model(baseSources);
}

export function sourcesEmptyFixture(): AiVisibilitySourcesLoad {
  return model(
    {
      ...baseSources,
      citedDomains: 0,
      pages: [],
      rows: [],
      totalAnswers: 0,
      unnamedOtherDomains: 0,
      yourSite: { allNamed: false, links: 0, unnamedLinks: 0 },
    },
    false,
  );
}

export function sourcesPlanFixture(): AiVisibilitySourcesLoad {
  return model({
    ...baseSources,
    plan,
    rows: rows.map((row) =>
      row.domain === "directory.example.org" ? { ...row, planState: "todo" } : row,
    ),
  });
}

export const sourcesProjectId = "prj_abcdefghijklmnopqrstuvwx";
