import {
  location,
  projectId,
  revision,
  writeContext,
} from "@/lib/business-locations/test-fixtures";
import { expect, it } from "vitest";
import { planStoredIdentity } from "./identity-plan";

it("reports an active identifier claim collision independently from revision CAS", () => {
  const current = revision(),
    other = location(revision("other"));
  try {
    planStoredIdentity({
      id: "new-identity",
      entityId: current.entityId,
      projectId,
      current,
      expectedRevision: 1,
      patch: { name: "Reviewed branch" },
      activeLocations: [other],
      context: writeContext,
      effectiveFrom: "2026-10-12T12:00:00.000Z",
      reason: "Review",
      idempotencyKey: "command",
    });
    expect.fail("collision must reject");
  } catch (error) {
    expect(error).toMatchObject({
      code: "business_location_conflict",
      status: 409,
      reason: "identifier_claimed",
    });
  }
});
