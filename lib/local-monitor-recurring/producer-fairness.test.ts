import { prisma } from "@/lib/db/prisma";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { produceDueRecurringMonitors } from "./producer";

const f = vi.hoisted(() => ({ query: vi.fn(), produce: vi.fn(), enabled: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $queryRaw: f.query } }));
vi.mock("./produce-one", () => ({ produceRecurringOccurrence: f.produce }));
vi.mock("./config", () => ({ recurringMonitorsEnabled: f.enabled }));
const now = new Date("2026-10-12T12:00:00Z");
beforeEach(() => {
  vi.resetAllMocks();
  f.enabled.mockReturnValue(true);
});
describe("bounded recurring fairness", () => {
  it.each(["original_target_owner", "queued_job", "running_job"])(
    "an independent26th advances past25 retained %s without touching their cursors",
    async (kind) => {
      const cohort = Array.from({ length: 26 }, (_, i) => ({
        id: `approval-${i + 1}`,
        held: i < 25,
      }));
      // Fake query port models the predicate-before-LIMIT contract, not real PostgreSQL execution.
      f.query.mockImplementation(async (strings: TemplateStringsArray) => {
        const sql = strings.join("?");
        const eligible =
          kind === "original_target_owner"
            ? sql.includes("AND NOT EXISTS(") &&
              sql.includes("local_measurement_target_owners") &&
              sql.includes('t."publicId"')
            : sql.includes("j.state IN ('queued','running')") && sql.includes("? target.value");
        return (eligible ? cohort.filter((row) => !row.held) : cohort)
          .slice(0, 25)
          .map(({ id }) => ({ id }));
      });
      f.produce.mockImplementation(async (id: string) =>
        id === "approval-26" ? "queued" : "target_retained",
      );
      expect(await produceDueRecurringMonitors({ db: prisma, clock: () => now })).toMatchObject({
        queued: 1,
        retained: 0,
      });
      expect(f.produce.mock.calls.map((call) => call[0])).toEqual(["approval-26"]);
      const [strings, date] = f.query.mock.calls[0];
      expect(date).toBe(now);
      const sql = strings.join("?");
      expect(sql).toContain('a."projectId"=c."projectId"');
      expect(sql).toContain('o."projectId"=c."projectId"');
      expect(sql).toContain('j."projectId"=c."projectId"');
      expect(sql).toContain("a.snapshot->'targetIds'");
      expect(sql.indexOf("AND NOT EXISTS")).toBeLessThan(sql.indexOf("LIMIT 25"));
      expect(sql).toContain('ORDER BY c."nextDueAt",c."approvalId" LIMIT 25');
    },
  );
  it("a newly acquired owner after outer selection is still refused under the existing project lock", async () => {
    f.query.mockResolvedValue([{ id: "raced" }, { id: "independent" }]);
    f.produce.mockResolvedValueOnce("target_retained").mockResolvedValueOnce("queued");
    expect(await produceDueRecurringMonitors({ db: prisma, clock: () => now })).toMatchObject({
      queued: 1,
      retained: 1,
    });
    expect(f.produce).toHaveBeenNthCalledWith(1, "raced", prisma, now);
  });
  it("default-off never reads candidates or admits work", async () => {
    f.enabled.mockReturnValue(false);
    expect(await produceDueRecurringMonitors()).toMatchObject({ enabled: false, queued: 0 });
    expect(f.query).not.toHaveBeenCalled();
    expect(f.produce).not.toHaveBeenCalled();
  });
});
