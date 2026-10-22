import {
  assignedDefinitionSourceFixture,
  definitionSourceFixture,
} from "@/lib/measurement-definitions/fixtures";
import type { DefinitionTransaction } from "@/lib/measurement-definitions/model";
import { describe, expect, it, vi } from "vitest";
import { hostCalendarFreshnessPorts } from "./host-calendar";

vi.mock("server-only", () => ({}));
const asOf = new Date("2026-03-27T12:00:00Z");
const tx = {} as DefinitionTransaction;
function setup() {
  const source = definitionSourceFixture();
  source.policy.defaults!.frequency = "daily";
  source.policy.defaults!.timezone = "Europe/Warsaw";
  const ports = hostCalendarFreshnessPorts({
    basis: "successor-own-slots-v1",
    configurationRevision: source.policy.config!.freshness.configurationRevision,
    legacyExecutionEngine: "legacy_compute",
  });
  return { source, ports };
}
describe("actual host calendar freshness policy", () => {
  it("ignores both legacy cadences without an assigned schedule", async () => {
    const { source, ports } = setup();
    source.policy.keywordSchedule = { ...source.policy.defaults!, id: "legacy" };
    expect(await ports.cadenceIntervalMs(tx, source, asOf)).toBeNull();
  });
  it("uses assigned intent before the legacy mirror and never substitutes disabled schedules", async () => {
    const { source, ports } = setup();
    source.policy.checkSchedule = {
      id: "assigned",
      publicId: "sch_assigned",
      projectId: source.projectId,
      frequency: "daily",
      cronExpression: null,
      timezone: "UTC",
      jitterMinutes: 0,
      serpDepth: 20,
      enabled: false,
      archivedAt: null,
      providerPolicy: null,
      timeOfDay: "06:00",
      isDefault: false,
    };
    expect(await ports.cadenceIntervalMs(tx, source, asOf)).toBeNull();
  });
  it("does not invent a missing monthly anchor or adopt unapproved config", async () => {
    const { source, ports } = setup();
    source.policy.defaults!.frequency = "monthly";
    expect(await ports.cadenceIntervalMs(tx, source, asOf)).toBeNull();
    source.policy.defaults!.frequency = "daily";
    source.policy.config!.freshness.configurationRevision = "other";
    expect(await ports.cadenceIntervalMs(tx, source, asOf)).toBeNull();
  });
  it("resolves two minute cron slots without materializing a year of planned tasks", async () => {
    const { source, ports } = setup();
    source.policy.checkSchedule = {
      id: "assigned",
      publicId: "sch_assigned",
      projectId: source.projectId,
      frequency: "custom_cron",
      cronExpression: "* * * * *",
      timezone: "UTC",
      jitterMinutes: 0,
      serpDepth: 20,
      enabled: true,
      archivedAt: null,
      providerPolicy: null,
      timeOfDay: "06:00",
      isDefault: false,
    };
    expect(await ports.cadenceIntervalMs(tx, source, asOf)).toBe(60_000);
  });
  it("does no provider request or database/schedule mutation", async () => {
    const { source, ports } = setup();
    source.policy.checkSchedule = assignedDefinitionSourceFixture().policy.checkSchedule;
    const fetch = vi.fn(() => {
      throw new Error("No provider I/O");
    });
    vi.stubGlobal("fetch", fetch);
    try {
      expect(await ports.cadenceIntervalMs(tx, source, asOf)).not.toBeNull();
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
