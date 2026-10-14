import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { fixtureSnapshot } from "@/components/measurement-settings/test-fixtures";
import { itemNotBefore, plannedOccurrences } from "@/lib/rank-check/planner/occurrence";
import { firstSettingsSlot, scheduleUpdateInput, settingsOccurrences } from "./calendar";
import { multiplyExact } from "./forecast";
import type { SettingsSource } from "./source";

const now = new Date("2026-10-25T00:00:00Z"),
  end = new Date("2026-11-22T00:00:00Z");
describe("actual assigned calendar phase and exact display AUTHORED_NOT_RUN", () => {
  it("uses actual public schedule phase and canonical jitter through DST; no fixed month multiplier", () => {
    const cadence = {
      publicId: fixtureSnapshot.scheduleId!,
      frequency: "weekly" as const,
      cronExpression: null,
      timeOfDay: null,
      timezone: "Europe/Warsaw",
      jitterMinutes: 60,
    };
    const expected = plannedOccurrences(cadence, now, end);
    expect(settingsOccurrences(cadence, now, end)).toEqual(expected);
    const slots = expected.flatMap((row) =>
      ["physical-keyword-a", "physical-keyword-b"].map((id) =>
        itemNotBefore(row, cadence, id, now).getTime(),
      ),
    );
    expect(
      firstSettingsSlot(expected, cadence, ["physical-keyword-a", "physical-keyword-b"], now),
    ).toBe(new Date(Math.min(...slots)).toISOString());
  });
  it("preserves null calendar phase on unchanged legacy cadence; new calendar must be explicit", () => {
    const source = {
      defaults: { serpDepth: 20, timezone: "UTC" },
      chain: [{ provider: "dataforseo" }],
      project: { publicId: `prj_${"a".repeat(24)}` },
      schedule: {
        publicId: fixtureSnapshot.scheduleId,
        frequency: "weekly",
        cronExpression: null,
        timeOfDay: null,
      },
    } as SettingsSource;
    const draft = {
      ...fixtureSnapshot.schedule!,
      frequency: "weekly" as const,
      timeOfDay: null,
      weekday: null,
      dayOfMonth: null,
    };
    const unchanged = scheduleUpdateInput(source, fixtureSnapshot.selection, draft);
    expect(unchanged.providerPolicy).toBeUndefined();
    expect(unchanged.serpDepth).toBeUndefined();
    expect(unchanged.frequency).toBeUndefined();
    expect(unchanged.cronExpression).toBeUndefined();
    expect(() =>
      scheduleUpdateInput(source, fixtureSnapshot.selection, { ...draft, timeOfDay: "09:00" }),
    ).toThrow();
    expect(
      scheduleUpdateInput(source, fixtureSnapshot.selection, {
        ...draft,
        timeOfDay: "09:00",
        weekday: "Tuesday",
      }).cronExpression,
    ).toBe("0 9 * * 2");
  });
  it("multiplies native decimals without Number precision loss", () => {
    expect(multiplyExact("900719925474099312345.00000000000000000001", 31)).toBe(
      "27922317689697078682695.00000000000000000031",
    );
    expect(multiplyExact("0.00000000000000000001", 31)).toBe("0.00000000000000000031");
    expect(() => multiplyExact("1e-9", 2)).toThrow();
  });
});
