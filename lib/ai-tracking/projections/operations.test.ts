import { describe, expect, it } from "vitest";
import { trackingPromptOperationProjection } from "./operations";

describe("prompt operation evidence", () => {
  it("preserves unknown observation time and exact older prompt revision despite a recorded timestamp", () => {
    const result = trackingPromptOperationProjection({
      latestSample: {
        publicId: "asm_old",
        promptRevision: { publicId: "apr_old", text: "  Exact older prompt  " },
        source: "model_api",
        engine: "chat_gpt",
        measurement: "unknown",
        evidence: {},
        createdAt: new Date("2026-10-08T10:00:00Z"),
      },
      upcomingSchedules: [],
      upcomingScheduleCount: 0,
      upcomingTruncated: false,
      earliestNextRunAt: null,
    });
    expect(result.lastResult).toEqual({
      sampleId: "asm_old",
      revisionId: "apr_old",
      text: "  Exact older prompt  ",
      measurement: "unknown",
      observedAt: null,
      recordedAt: "2026-10-08T10:00:00.000Z",
    });
  });
  it("uses the full-query earliest schedule while disclosing capped source links", () => {
    const result = trackingPromptOperationProjection({
      latestSample: null,
      upcomingSchedules: [
        {
          schedulePublicId: "ais_preview",
          nextRunAt: null,
          cron: "0 9 * * 1",
          timezone: "UTC",
          configurations: [],
        },
      ],
      upcomingScheduleCount: 10,
      upcomingTruncated: true,
      earliestNextRunAt: new Date("2026-10-09T09:00:00Z"),
    });
    expect(result).toMatchObject({
      nextRunAt: "2026-10-09T09:00:00.000Z",
      nextRunPending: true,
      sourceScopeLimited: true,
    });
  });
});
