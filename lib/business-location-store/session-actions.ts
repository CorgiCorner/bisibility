"use server";

import { getActionActor } from "@/lib/actions/_shared";
import type {
  AssignmentSummary,
  BusinessCommandResult,
  LocationSummary,
  MatchSummary,
} from "@/lib/business-locations/ui-contracts";
import { assignBusinessLocationFor } from "./assignment-write";
import { businessCommandResult as result } from "./command-result";
import type { BusinessStoreContext } from "./context";
import { BusinessLocationUnavailableError } from "./errors";
import { readBusinessIdentityHistory } from "./identity-history";
import {
  createBusinessLocationFor,
  reviseBusinessLocationFor,
  setBusinessLocationStateFor,
} from "./location-write";
import { rematchBusinessLocationFor, reviewBusinessCandidateFor } from "./match-write";
import { readBusinessObservationChoices, readBusinessReviewContext } from "./review-context";
import {
  assignLocationSchema,
  createLocationSchema,
  rematchLocationSchema,
  reviewMatchSchema,
  reviseLocationSchema,
  stateLocationSchema,
} from "./schema";
import { readBusinessScopeChoices } from "./scope-choices";
import {
  readAssignmentSummaryFor,
  readLocationListSummaryFor,
  readLocationSummaryFor,
  readMatchSummariesFor,
} from "./ui-read";

async function context(): Promise<BusinessStoreContext> {
  return { actor: await getActionActor() };
}

export async function readBusinessLocations(projectId: string) {
  return readLocationListSummaryFor(projectId, await context());
}
export async function readBusinessLocationCurrent(projectId: string, locationId: string) {
  return readLocationSummaryFor(projectId, locationId, await context());
}
export async function readBusinessIdentityVersions(
  projectId: string,
  locationId: string,
  after: unknown,
) {
  return readBusinessIdentityHistory(projectId, locationId, after, await context());
}
export async function listBusinessObservationChoices(projectId: string, after: unknown) {
  return readBusinessObservationChoices(projectId, after, await context());
}
export async function readBusinessReviewCurrent(
  projectId: string,
  locationId: string,
  runId: string,
  selection: unknown = {},
) {
  return readBusinessReviewContext(
    projectId,
    locationId,
    runId,
    await context(),
    undefined,
    selection,
  );
}
export async function saveBusinessIdentity(
  input: unknown,
): Promise<BusinessCommandResult<LocationSummary>> {
  const ctx = await context();
  const revising = reviseLocationSchema.safeParse(input);
  if (revising.success) {
    const data = revising.data;
    const read = () => readLocationSummaryFor(data.projectId, data.locationId, ctx);
    return result(async () => {
      await reviseBusinessLocationFor(data, ctx);
      return read();
    }, read);
  }
  const creation = createLocationSchema.safeParse(input);
  if (!creation.success) return { kind: "error" };
  return result(async () => {
    const saved = await createBusinessLocationFor(creation.data, ctx);
    if (saved.receipt.kind !== "identity") throw new BusinessLocationUnavailableError();
    return readLocationSummaryFor(creation.data.projectId, saved.receipt.publicId, ctx);
  });
}
export async function saveBusinessLocationState(
  input: unknown,
): Promise<BusinessCommandResult<LocationSummary>> {
  const ctx = await context();
  const parsed = stateLocationSchema.safeParse(input);
  if (!parsed.success) return { kind: "error" };
  const read = () => readLocationSummaryFor(parsed.data.projectId, parsed.data.locationId, ctx);
  return result(async () => {
    await setBusinessLocationStateFor(parsed.data, ctx);
    return read();
  }, read);
}
export async function readBusinessAssignmentCurrent(projectId: string, selected: unknown) {
  const input = assignLocationSchema.shape.scope.parse(selected);
  return readAssignmentSummaryFor(projectId, input, await context());
}
export async function searchBusinessAssignmentScopes(projectId: string, input: unknown) {
  return readBusinessScopeChoices(projectId, input, await context());
}
export async function saveBusinessAssignment(
  input: unknown,
): Promise<BusinessCommandResult<AssignmentSummary>> {
  const ctx = await context();
  const parsed = assignLocationSchema.safeParse(input);
  if (!parsed.success) return { kind: "error" };
  const read = () => readAssignmentSummaryFor(parsed.data.projectId, parsed.data.scope, ctx);
  return result(async () => {
    await assignBusinessLocationFor(parsed.data, ctx);
    return read();
  }, read);
}
export async function readBusinessMatchCurrent(
  projectId: string,
  locationId: string,
  runId: string,
  itemId: string,
) {
  const rows = await readMatchSummariesFor(projectId, locationId, runId, await context());
  const row = rows.find((item) => item.itemId === itemId);
  if (!row) throw new BusinessLocationUnavailableError();
  return row;
}
export async function reviewBusinessMatch(
  input: unknown,
): Promise<BusinessCommandResult<MatchSummary>> {
  const ctx = await context();
  const parsed = reviewMatchSchema.safeParse(input);
  if (!parsed.success) return { kind: "error" };
  const { projectId, locationId, observationRunId, itemId } = parsed.data;
  const read = async () => {
    const rows = await readMatchSummariesFor(projectId, locationId, observationRunId, ctx);
    const current = rows.find((row) => row.itemId === itemId);
    if (!current) throw new BusinessLocationUnavailableError();
    return current;
  };
  return result(async () => {
    await reviewBusinessCandidateFor(parsed.data, ctx);
    return read();
  }, read);
}
export async function rematchBusinessObservations(
  input: unknown,
): Promise<BusinessCommandResult<{ decisionCount: number }>> {
  const ctx = await context();
  const parsed = rematchLocationSchema.safeParse(input);
  if (!parsed.success) return { kind: "error" };
  return result(async () => {
    const saved = await rematchBusinessLocationFor(parsed.data, ctx);
    if (saved.receipt.kind !== "match") throw new BusinessLocationUnavailableError();
    return { decisionCount: saved.receipt.decisionIds.length };
  });
}
