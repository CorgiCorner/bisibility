import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { SIGNAL_TYPES } from "@/lib/signals/types";
import { requireReadableProject } from "./_auth";
import { getRequestProjectDefaults } from "./workspace-request-data";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

export type TimelineFilterKey = "all" | "deploys" | "notes" | "pages" | "rankings";
export type TimelineSignalRow = Prisma.SignalGetPayload<{
  include: {
    createdBy: { select: { email: true; name: true } };
    keyword: {
      select: {
        device: true;
        locationRef: { select: { displayName: true; languageLabel: true } };
        publicId: true;
        text: true;
      };
    };
  };
}>;
export type TimelineView = {
  filter: TimelineFilterKey;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  isFiltered: boolean;
  now: Date;
  page: number;
  rows: TimelineSignalRow[];
  search: string;
  timeZone: string;
};
export type TimelineQueryInput = {
  filter?: string | string[];
  now?: Date;
  page?: number | string | string[];
  pageSize?: number;
  q?: string | string[];
  search?: string | string[];
};

const filterKeys = ["all", "rankings", "pages", "deploys", "notes"] satisfies TimelineFilterKey[];
const pageSignalTypes = [
  SIGNAL_TYPES.sitemapChanged,
  SIGNAL_TYPES.pageChanged,
  SIGNAL_TYPES.urlIndexed,
  SIGNAL_TYPES.urlDeindexed,
];

function firstValue(value: number | string | string[] | undefined) {
  if (typeof value === "number") return String(value);
  return Array.isArray(value) ? value[0] : value;
}

function normalize(input: TimelineQueryInput) {
  const rawFilter = firstValue(input.filter);
  const page = Number(firstValue(input.page));
  const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE;
  const filter = filterKeys.includes(rawFilter as TimelineFilterKey)
    ? (rawFilter as TimelineFilterKey)
    : "all";

  return {
    filter,
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: Number.isInteger(pageSize)
      ? Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE,
    search: (firstValue(input.search) ?? firstValue(input.q) ?? "").trim().slice(0, 80),
  };
}

function andWhere(...parts: (Prisma.SignalWhereInput | undefined)[]): Prisma.SignalWhereInput {
  const active = parts.filter(Boolean) as Prisma.SignalWhereInput[];
  return active.length === 1 ? active[0] : { AND: active };
}

function searchWhere(search: string): Prisma.SignalWhereInput | undefined {
  if (!search) return undefined;
  const contains = { contains: search, mode: "insensitive" as const };

  return {
    OR: [
      { publicId: contains },
      { type: contains },
      { url: contains },
      {
        payload: {
          mode: "insensitive",
          path: ["note"],
          string_contains: search,
        },
      },
    ],
  };
}

function filterWhere(filter: TimelineFilterKey): Prisma.SignalWhereInput | undefined {
  if (filter === "rankings") return { source: "rank_tracker" };
  if (filter === "pages") {
    return {
      OR: [{ type: { in: pageSignalTypes } }, { source: { in: ["sitemap", "url_inspection"] } }],
    };
  }
  if (filter === "deploys") return { source: { in: ["deploy", "cms", "api"] } };
  if (filter === "notes") return { type: SIGNAL_TYPES.note };
  return undefined;
}

export async function getTimelineView(
  projectId: string,
  input: TimelineQueryInput = {},
): Promise<TimelineView> {
  const { project } = await requireReadableProject(projectId);
  const now = input.now ?? new Date();
  const { filter, page, pageSize, search } = normalize(input);
  const [defaults, rows] = await Promise.all([
    getRequestProjectDefaults(project.id),
    prisma.signal.findMany({
      include: {
        createdBy: { select: { email: true, name: true } },
        keyword: {
          select: {
            device: true,
            locationRef: { select: { displayName: true, languageLabel: true } },
            publicId: true,
            text: true,
          },
        },
      },
      orderBy: [{ happenedAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize + 1,
      where: andWhere({ projectId: project.id }, searchWhere(search), filterWhere(filter)),
    }),
  ]);

  return {
    filter,
    hasNextPage: rows.length > pageSize,
    hasPreviousPage: page > 1,
    isFiltered: Boolean(search) || filter !== "all",
    now,
    page,
    rows: rows.slice(0, pageSize),
    search,
    timeZone: defaults?.timezone ?? "UTC",
  };
}
