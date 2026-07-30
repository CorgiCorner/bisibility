import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emailBudgetUtcDay, reserveEmailDailyBudget, resolveEmailDailyBudget } from "./budget";

type Stat = { count: number; exhaustionNotifiedAt: Date | null };

const mocks = vi.hoisted(() => ({
  emailDailyStat: {
    updateMany: vi.fn(),
    upsert: vi.fn(),
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: { emailDailyStat: mocks.emailDailyStat } }));

function installAtomicStore() {
  const stats = new Map<string, Stat>();
  const key = (day: Date, category: string) => `${day.toISOString()}:${category}`;
  mocks.emailDailyStat.upsert.mockImplementation(async ({ create }) => {
    const statKey = key(create.day, create.category);
    if (!stats.has(statKey)) stats.set(statKey, { count: 0, exhaustionNotifiedAt: null });
    return {};
  });
  mocks.emailDailyStat.updateMany.mockImplementation(async ({ data, where }) => {
    const stat = stats.get(key(where.day, where.category));
    if (!stat) return { count: 0 };
    if (data.count) {
      if (stat.count >= where.count.lt) return { count: 0 };
      stat.count += 1;
      return { count: 1 };
    }
    if (data.exhaustionNotifiedAt && stat.exhaustionNotifiedAt === null) {
      stat.exhaustionNotifiedAt = data.exhaustionNotifiedAt;
      return { count: 1 };
    }
    return { count: 0 };
  });
  return stats;
}

describe("email daily budget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installAtomicStore();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("atomically grants only the guarded number of concurrent reservations", async () => {
    vi.stubEnv("EMAIL_DAILY_BUDGET_BULK", "2");
    const now = new Date("2026-07-23T12:00:00.000Z");

    const reservations = await Promise.all([
      reserveEmailDailyBudget("bulk", now),
      reserveEmailDailyBudget("bulk", now),
      reserveEmailDailyBudget("bulk", now),
    ]);

    expect(reservations.map(({ granted }) => granted).filter(Boolean)).toHaveLength(2);
    expect(mocks.emailDailyStat.updateMany).toHaveBeenCalledWith({
      data: { count: { increment: 1 } },
      where: { category: "bulk", count: { lt: 2 }, day: emailBudgetUtcDay(now) },
    });
  });

  it("starts a fresh budget after UTC midnight", async () => {
    vi.stubEnv("EMAIL_DAILY_BUDGET_TRANSACTIONAL", "1");

    await expect(
      reserveEmailDailyBudget("transactional", new Date("2026-07-23T23:59:59.000Z")),
    ).resolves.toMatchObject({ granted: true });
    await expect(
      reserveEmailDailyBudget("transactional", new Date("2026-07-24T00:00:00.000Z")),
    ).resolves.toMatchObject({ granted: true });

    expect(mocks.emailDailyStat.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          day_category: {
            category: "transactional",
            day: new Date("2026-07-24T00:00:00.000Z"),
          },
        },
      }),
    );
  });

  it("keeps transactional and bulk reservations isolated", async () => {
    vi.stubEnv("EMAIL_DAILY_BUDGET_BULK", "1");
    vi.stubEnv("EMAIL_DAILY_BUDGET_TRANSACTIONAL", "1");
    const now = new Date("2026-07-23T12:00:00.000Z");

    await expect(reserveEmailDailyBudget("bulk", now)).resolves.toMatchObject({ granted: true });
    await expect(reserveEmailDailyBudget("transactional", now)).resolves.toMatchObject({
      granted: true,
    });
    await expect(reserveEmailDailyBudget("bulk", now)).resolves.toMatchObject({ granted: false });
    await expect(reserveEmailDailyBudget("transactional", now)).resolves.toMatchObject({
      granted: false,
    });
  });

  it("reads category overrides lazily and falls back for invalid values", () => {
    expect(resolveEmailDailyBudget("bulk")).toBe(1_000);
    vi.stubEnv("EMAIL_DAILY_BUDGET_BULK", "37");
    vi.stubEnv("EMAIL_DAILY_BUDGET_TRANSACTIONAL", "23");
    expect(resolveEmailDailyBudget("bulk")).toBe(37);
    expect(resolveEmailDailyBudget("transactional")).toBe(23);
    vi.stubEnv("EMAIL_DAILY_BUDGET_BULK", "0");
    expect(resolveEmailDailyBudget("bulk")).toBe(1_000);
  });

  it("claims the exhaustion notification only once per category and UTC day", async () => {
    vi.stubEnv("EMAIL_DAILY_BUDGET_BULK", "1");
    const now = new Date("2026-07-23T12:00:00.000Z");

    await reserveEmailDailyBudget("bulk", now);
    await expect(reserveEmailDailyBudget("bulk", now)).resolves.toMatchObject({
      granted: false,
      notificationDue: true,
    });
    await expect(reserveEmailDailyBudget("bulk", now)).resolves.toMatchObject({
      granted: false,
      notificationDue: false,
    });
  });
});
