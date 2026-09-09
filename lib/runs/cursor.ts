import { z } from "zod";
import { type ProjectRunKind, projectRunKindSchema } from "./contracts";
import {
  type ProjectRunsFilters,
  type ProjectRunsView,
  projectRunsFiltersSchema,
  sameProjectRunsFilters,
} from "./filters";

const PROJECT_RUNS_CURSOR_VERSION = 1;
const PROJECT_RUN_KIND_TIE_BREAK_ORDER: readonly ProjectRunKind[] = ["gsc_import", "rank_check"];

export const projectRunsSortTupleSchema = z
  .object({
    id: z.string().min(1),
    kind: projectRunKindSchema,
    sortAt: z.iso.datetime(),
  })
  .strict();

export type ProjectRunsSortTuple = z.infer<typeof projectRunsSortTupleSchema>;

export const projectRunsPlannedSortTupleSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal("rank_check"),
    plannedFor: z.iso.datetime(),
  })
  .strict();

export type ProjectRunsPlannedSortTuple = z.infer<typeof projectRunsPlannedSortTupleSchema>;

type ProjectRunsCursorFilters<View extends ProjectRunsView> = ProjectRunsFilters &
  Readonly<{ view: View }>;

export type ProjectRunsCursorSortTuple = ProjectRunsSortTuple | ProjectRunsPlannedSortTuple;

export type ProjectRunsCursorSortTupleForView<View extends ProjectRunsView> = View extends "planned"
  ? ProjectRunsPlannedSortTuple
  : ProjectRunsSortTuple;

export type ProjectRunsCursorInput<View extends ProjectRunsView = ProjectRunsView> = Readonly<{
  filters: ProjectRunsCursorFilters<View>;
  sort: ProjectRunsCursorSortTupleForView<View>;
}>;

const projectRunsCursorSchema = z.union([
  z
    .object({
      filters: projectRunsFiltersSchema.extend({ view: z.literal("runs") }),
      sort: projectRunsSortTupleSchema,
      v: z.literal(PROJECT_RUNS_CURSOR_VERSION),
    })
    .strict(),
  z
    .object({
      filters: projectRunsFiltersSchema.extend({ view: z.literal("planned") }),
      sort: projectRunsPlannedSortTupleSchema,
      v: z.literal(PROJECT_RUNS_CURSOR_VERSION),
    })
    .strict(),
]);

export type ProjectRunsCursor = z.infer<typeof projectRunsCursorSchema>;

export class ProjectRunsCursorError extends Error {
  constructor(message = "Cursor must be a valid project runs cursor.") {
    super(message);
    this.name = "ProjectRunsCursorError";
  }
}

function parseCursor(value: string): ProjectRunsCursor {
  try {
    return projectRunsCursorSchema.parse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    );
  } catch {
    throw new ProjectRunsCursorError();
  }
}

export function encodeProjectRunsCursor<View extends ProjectRunsView>(
  input: ProjectRunsCursorInput<View>,
): string {
  return Buffer.from(
    JSON.stringify(projectRunsCursorSchema.parse({ ...input, v: PROJECT_RUNS_CURSOR_VERSION })),
  ).toString("base64url");
}

export function decodeProjectRunsCursor<View extends ProjectRunsView>(
  value: string | null,
  expectedFilters: ProjectRunsCursorFilters<View>,
): ProjectRunsCursorSortTupleForView<View> | null {
  if (!value) return null;

  const cursor = parseCursor(value);
  if (!sameProjectRunsFilters(cursor.filters, projectRunsFiltersSchema.parse(expectedFilters))) {
    throw new ProjectRunsCursorError("Cursor belongs to a different project runs filter set.");
  }
  return cursor.sort as ProjectRunsCursorSortTupleForView<View>;
}

function compareText(left: string, right: string) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function kindTieBreakPosition(kind: ProjectRunKind) {
  return PROJECT_RUN_KIND_TIE_BREAK_ORDER.indexOf(kind);
}

/** Descending sort instant, then ascending fixed kind and id tie-breakers. */
export function compareProjectRunsSortTuples(
  left: ProjectRunsSortTuple,
  right: ProjectRunsSortTuple,
): number {
  const instantDifference = Date.parse(right.sortAt) - Date.parse(left.sortAt);
  if (instantDifference !== 0) return instantDifference;

  const kindDifference = kindTieBreakPosition(left.kind) - kindTieBreakPosition(right.kind);
  return kindDifference === 0 ? compareText(left.id, right.id) : kindDifference;
}

/** Ascending planned term, then ascending fixed kind and id tie-breakers. */
export function compareProjectRunsPlannedSortTuples(
  left: ProjectRunsPlannedSortTuple,
  right: ProjectRunsPlannedSortTuple,
): number {
  const instantDifference = Date.parse(left.plannedFor) - Date.parse(right.plannedFor);
  if (instantDifference !== 0) return instantDifference;

  const kindDifference = kindTieBreakPosition(left.kind) - kindTieBreakPosition(right.kind);
  return kindDifference === 0 ? compareText(left.id, right.id) : kindDifference;
}
