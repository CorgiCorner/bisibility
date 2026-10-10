import { downloadTrackingEvidence } from "@/lib/ai-tracking/exports/browser";
import type { TrackingWorkspaceActions } from "@/lib/ai-tracking/projections/workspace-actions";
import {
  trackingFixtureActions,
  trackingSampleFixtures,
  trackingWorkspaceFixture,
} from "./fixtures";

export const pagedTrackingFixture = {
  ...trackingWorkspaceFixture,
  runsNextCursor: "history-page-2",
};
export const pagedTrackingActions: TrackingWorkspaceActions = {
  ...trackingFixtureActions,
  runs: async () => ({
    items: [
      ...trackingWorkspaceFixture.runs.slice(1),
      {
        id: "air_oct06",
        state: "completed",
        createdAt: "2026-10-06T09:00:00.000Z",
        sampleCount: 3,
      },
    ],
    nextCursor: null,
  }),
  samples: async (_runId, cursor) =>
    cursor
      ? { items: [trackingSampleFixtures[0], ...trackingSampleFixtures.slice(1)], nextCursor: null }
      : { items: [trackingSampleFixtures[0]], nextCursor: "sample-page-2" },
  export: async (runId, format, cursor) =>
    downloadTrackingEvidence(
      runId,
      format,
      (page) => pagedTrackingActions.samples(runId, page),
      cursor,
    ),
};
export const boundedTrackingActions: TrackingWorkspaceActions = {
  ...trackingFixtureActions,
  samples: async (_runId, cursor) => {
    const offset = cursor ? Number(cursor) : 0;
    return {
      items: Array.from({ length: Math.min(50, 1001 - offset) }, (_, index) => ({
        ...trackingSampleFixtures[0],
        id: `asm_export_${offset + index}`,
      })),
      nextCursor: offset + 50 < 1001 ? String(offset + 50) : null,
    };
  },
  export: async (runId, format, cursor) =>
    downloadTrackingEvidence(
      runId,
      format,
      (page) => boundedTrackingActions.samples(runId, page),
      cursor,
    ),
};
