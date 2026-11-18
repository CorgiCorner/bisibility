import { keywordMembershipSchedule } from "@/lib/keywords/schedule-membership";
import { describe, expect, it, vi } from "vitest";
import { type KeywordRecord, keywordResource } from "./resources";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

const now = new Date("2026-10-08T00:00:00.000Z");
const membership = {
  publicId: "sch_a00000000000000000000000",
  enabled: true,
  archivedAt: null,
  frequency: "daily" as const,
  cronExpression: null,
  jitterMinutes: 15,
  timeOfDay: "06:00",
  timezone: "UTC",
  name: "Daily",
  serpDepth: 20,
};

function record(checkSchedule: unknown): KeywordRecord {
  return {
    id: "keyword_internal",
    publicId: "kw_a00000000000000000000000",
    text: "rank tracker",
    location: "US",
    locationRef: { canonicalKey: "US", languageCode: "en", languageLabel: "English" },
    device: "desktop",
    intent: "commercial",
    topic: "tracking",
    targetUrl: "https://example.com/tracker",
    createdAt: now,
    updatedAt: now,
    checkSchedule,
    project: { defaults: { timezone: "Europe/Warsaw" } },
    schedule: { frequency: "weekly", timezone: "Europe/Warsaw", jitterMinutes: 60 },
    tags: [{ tag: { name: "Product" } }],
    rankChecks: [],
  } as unknown as KeywordRecord;
}

// Only the two explicitly authorized additive membership fields are outside this baseline.
function legacyResponse(resource: ReturnType<typeof keywordResource>) {
  if (!resource.schedule) return resource;
  const schedule = { ...resource.schedule } as Record<string, unknown>;
  delete schedule.schedule_id;
  delete schedule.schedule_state;
  return { ...resource, schedule };
}

describe("public keyword schedule response characterization", () => {
  it.each([
    ["unassigned", null],
    ["active", membership],
    ["disabled", { ...membership, enabled: false }],
    ["archived", { ...membership, archivedAt: now }],
    ["manual", { ...membership, frequency: "manual" }],
    ["paused", { ...membership, frequency: "paused" }],
    ["custom cron", { ...membership, frequency: "custom_cron", cronExpression: "0 9 * * 1" }],
  ])("records every existing field for %s membership", (_label, checkSchedule) => {
    const resource = keywordResource(
      record(checkSchedule),
      "prj_a00000000000000000000000",
      null,
      (row, id, timezone) => keywordMembershipSchedule(row, id, timezone, now),
    );
    expect(legacyResponse(resource)).toMatchSnapshot();
  });
});
