import { randomUUID } from "node:crypto";
import { assignBusinessLocationFor } from "@/lib/business-location-store/assignment-write";
import { readBusinessLocationFor } from "@/lib/business-location-store/location-read";
import { createBusinessLocationFor } from "@/lib/business-location-store/location-write";
import {
  type BusinessPgFixture,
  identityCommand,
  seedBusinessProject,
  seedRetainedObservation,
} from "@/lib/business-location-store/postgres.test-fixture";
import type { RankTrackerReportOptions } from "@/lib/queries/rank-tracker-report-model";
import { hostOrganicReportPolicy, RANK_REPORT_HOST_LIMITS } from "@/lib/rank-reports/host-policy";
import { sessionSavedViewContext } from "@/lib/saved-views/context";
import { dashboardLocalSelectionSchema } from "./selection";

export async function localDashboardFixture(fixture: BusinessPgFixture) {
  const project = await seedBusinessProject(fixture);
  const created = await createBusinessLocationFor(
    identityCommand(project.project.publicId, "123"),
    project.writerContext,
    fixture.db,
  );
  if (created.receipt.kind !== "identity") throw new Error("Expected created identity");
  const { location } = await readBusinessLocationFor(
    project.project.publicId,
    created.receipt.publicId,
    project.writerContext,
    fixture.db,
  );
  const observed = await seedRetainedObservation(fixture, project.project.id, { cid: "123" });
  const scope = { kind: "keyword" as const, id: observed.keyword.publicId };
  const target = { locationId: location.publicId, identityRevisionId: location.currentRevision.id };
  await assignBusinessLocationFor(
    {
      projectId: project.project.publicId,
      scope,
      target,
      expectedRevision: 0,
      reason: "Local dashboard fixture",
      idempotencyKey: randomUUID(),
    },
    project.writerContext,
    fixture.db,
  );
  const selection = dashboardLocalSelectionSchema.parse({
    scope,
    ...target,
    assignmentRevision: 1,
  });
  const viewer = sessionSavedViewContext(project.ownerContext.actor!);
  const reportOptions = (comparisonDays = 28): RankTrackerReportOptions => ({
    asOf: new Date(),
    limits: { ...RANK_REPORT_HOST_LIMITS },
    policyAt: (at) => hostOrganicReportPolicy(at, comparisonDays),
    // This legacy fixture deliberately has no immutable current-definition proof.
    loadMetadata: async () => new Map(),
  });
  return { ...project, observed, location, selection, viewer, target, reportOptions };
}
