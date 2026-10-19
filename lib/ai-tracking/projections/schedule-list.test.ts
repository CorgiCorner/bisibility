import type { AiPrompt, AiTrackingSchedule } from "@/lib/generated/prisma/client";
import { describe, expect, it } from "vitest";
import {
  canWriteAiTracking,
  trackingPromptStatus,
  trackingScheduleListItems,
} from "./schedule-list";
import { buildAiSchedulePayload } from "./schedule-payload";

const prompts = [
  { id: "prompt_1", publicId: "aip_one" },
  { id: "prompt_2", publicId: "aip_two" },
] as AiPrompt[];

function schedule(overrides: Partial<AiTrackingSchedule>): AiTrackingSchedule {
  return {
    id: "schedule_1",
    publicId: "ais_current",
    projectId: "project_1",
    name: "Weekly",
    cron: "0 9 * * 1",
    timezone: "Europe/Warsaw",
    enabled: true,
    archivedAt: null,
    nextRunAt: new Date("2026-10-26T08:00:00.000Z"),
    configuration: { promptIds: ["prompt_1", "prompt_missing"], configurations: [] },
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    updatedAt: new Date("2026-10-01T00:00:00.000Z"),
    ...overrides,
  } as AiTrackingSchedule;
}

describe("AI schedule list read model", () => {
  it("applies one write rule for role and project write mode", () => {
    expect(canWriteAiTracking("member", "active")).toBe(true);
    expect(canWriteAiTracking("viewer", "active")).toBe(false);
    expect(canWriteAiTracking(null, "active")).toBe(false);
    expect(canWriteAiTracking("owner", "migration_hold")).toBe(false);
    expect(canWriteAiTracking("owner", "migrated")).toBe(false);
  });

  it("splits current and archived schedules and exposes only public prompt ids", () => {
    const rows = [
      schedule({}),
      schedule({
        id: "schedule_2",
        publicId: "ais_archived",
        enabled: false,
        nextRunAt: null,
        archivedAt: new Date("2026-10-10T00:00:00.000Z"),
      }),
    ];
    expect(trackingScheduleListItems(rows, prompts, "current")).toEqual([
      {
        id: "ais_current",
        name: "Weekly",
        cron: "0 9 * * 1",
        timezone: "Europe/Warsaw",
        enabled: true,
        nextRunAt: "2026-10-26T08:00:00.000Z",
        archivedAt: null,
        promptIds: ["aip_one"],
        configurations: [],
      },
    ]);
    expect(trackingScheduleListItems(rows, prompts, "archived")).toEqual([
      expect.objectContaining({ id: "ais_archived", archivedAt: "2026-10-10T00:00:00.000Z" }),
    ]);
  });

  it("treats prompts under paused or archived topics as inactive", () => {
    const topics = [
      { id: "topic_paused", pausedAt: new Date(), archivedAt: null },
      { id: "topic_live", pausedAt: null, archivedAt: null },
    ];
    const prompt = { archivedAt: null, pausedAt: null, topicId: "topic_live" };
    expect(trackingPromptStatus(prompt, topics)).toBe("active");
    expect(trackingPromptStatus({ ...prompt, topicId: "topic_paused" }, topics)).toBe("paused");
    expect(trackingPromptStatus({ ...prompt, archivedAt: new Date() }, topics)).toBe("archived");
  });

  it("builds the frozen schedule payload only with explicit consent", () => {
    const preview = {
      configurations: [],
      credentialConnectionId: "apc_1",
      credentialVersion: "credential_1",
      budgetRevision: "budget_1",
      consentRevision: "consent_1",
      estimatedCostCents: 1,
    };
    const payload = buildAiSchedulePayload(
      { name: "Weekly", cron: "0 9 * * 1", timezone: "UTC", enabled: true, consent: true },
      preview,
      ["aip_one"],
      Date.parse("2026-10-19T00:00:00.000Z"),
    );
    expect(payload).toEqual({
      name: "Weekly",
      cron: "0 9 * * 1",
      timezone: "UTC",
      enabled: true,
      consent: true,
      configuration: {
        ...preview,
        promptIds: ["aip_one"],
        idempotencyKey: expect.any(String),
        origin: "manual",
        entrySource: "app",
        deadline: "2026-10-20T00:00:00.000Z",
      },
    });
    const disabled = {
      name: "Weekly",
      cron: "0 9 * * 1",
      timezone: "UTC",
      enabled: false,
      consent: true,
    };
    expect(buildAiSchedulePayload(disabled, preview, []).consent).toBe(false);
    expect(
      buildAiSchedulePayload({ ...disabled, enabled: true, consent: false }, preview, []).consent,
    ).toBe(false);
  });
});
