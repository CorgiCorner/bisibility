import { describe, expect, it } from "vitest";
import { reviewedManualCommand, reviewedScheduleCommand } from "./commands";
import {
  acceptMeasurementQuote,
  beginMeasurementDraft,
  editMeasurementDraft,
  previewRequest,
} from "./draft";
import {
  fixtureChoices,
  fixtureNow,
  fixtureProjectId,
  fixtureQuote,
  fixtureSnapshot,
  fixtureSpec,
} from "./test-fixtures";

const context = {
  choices: fixtureChoices,
  currentRevision: 4,
  currentRateVersion: "synthetic-rate-v1",
  now: fixtureNow,
};
function reviewed() {
  const base = beginMeasurementDraft(fixtureSnapshot);
  const request = previewRequest(base, fixtureProjectId, fixtureSpec);
  return { draft: acceptMeasurementQuote(base, request, fixtureQuote(request)), request };
}
describe("typed intent builders keep authorizing operations separate", () => {
  it("requires consent and never sends quoted amounts, actors, schedule draft or auth capabilities in the manual command", () => {
    const { draft, request } = reviewed();
    expect(reviewedManualCommand(draft, request, context)).toBeNull();
    const command = reviewedManualCommand(
      { ...draft, acknowledgement: "manual" },
      request,
      context,
    );
    expect(command).toMatchObject({
      previewToken: "synthetic-opaque-token-not-a-real-signature",
      expectedRevision: 4,
      confirmed: true,
    });
    expect(Object.keys(command!).sort()).toEqual([
      "capabilityVersion",
      "confirmed",
      "depth",
      "expectedRevision",
      "expectedSourceHash",
      "intent",
      "measurementToken",
      "previewToken",
      "projectId",
      "providerId",
      "scheduleId",
      "spec",
    ]);
  });
  it("uses the schedule-only token and target, never a manual token or implied new schedule", () => {
    const { draft } = reviewed();
    const changed = editMeasurementDraft(draft, {
      schedule: { ...draft.schedule!, frequency: "weekly" },
    });
    const request = previewRequest(changed, fixtureProjectId, fixtureSpec);
    const current = {
      ...acceptMeasurementQuote(changed, request, fixtureQuote(request)),
      acknowledgement: "schedule" as const,
    };
    expect(reviewedScheduleCommand(current, request, context)).toMatchObject({
      previewToken: "synthetic-schedule-token-not-a-manual-token",
      scheduleId: fixtureSnapshot.scheduleId,
      schedule: { ...fixtureSnapshot.schedule, frequency: "weekly" },
    });
    expect(reviewedManualCommand(current, request, context)).toBeNull();
    expect(
      reviewedScheduleCommand(
        { ...current, quote: { ...current.quote!, schedulePreview: null } },
        request,
        context,
      ),
    ).toBeNull();
  });
  it("rejects old quotes, latest rate drift, changed options and invalid form at command creation", () => {
    const { draft, request } = reviewed();
    const acknowledged = { ...draft, acknowledgement: "manual" as const };
    expect(
      reviewedManualCommand(acknowledged, request, {
        ...context,
        now: new Date("2026-10-12T10:10:00Z"),
      }),
    ).toBeNull();
    expect(
      reviewedManualCommand(acknowledged, request, { ...context, currentRateVersion: "v2" }),
    ).toBeNull();
    expect(
      reviewedManualCommand(
        { ...acknowledged, selection: { ...acknowledged.selection, depth: 50 } },
        request,
        context,
      ),
    ).toBeNull();
    expect(
      reviewedManualCommand(
        { ...acknowledged, schedule: { ...acknowledged.schedule!, jitterMinutes: 121 } },
        request,
        context,
      ),
    ).toBeNull();
  });
});
