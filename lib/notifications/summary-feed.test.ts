import { localeValues } from "@/i18n/config";
import { beforeEach, expect, it, vi } from "vitest";
import { getNotificationFeedForScope } from "./feed";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), count: vi.fn(), locale: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { notification: { findMany: mocks.findMany, count: mocks.count } },
}));
vi.mock("@/lib/queries/account", () => ({ getLocalePreferenceForUser: mocks.locale }));
const row = {
  title: "Stored English must never win",
  body: "Stored body must never win",
  payload: {
    kind: "scheduled",
    windowStart: "2026-10-25T00:00:00Z",
    windowEnd: "2026-10-25T01:00:00Z",
    counts: { up: 2, down: 1, failed: 3, under_review: 4, unchanged: 5, new: 6 },
    linkedIncidentIds: [] as string[],
  },
  type: "scheduled_window_summary",
  version: 1,
  withdrawnAt: null,
  createdAt: new Date("2026-10-25T01:00:00Z"),
  readAt: null,
  publicId: "ntf_abcdefghijklmnopqrstuvwx",
  project: { publicId: "prj_abcdefghijklmnopqrstuvwx", name: "Fixture", domain: "example.test" },
};
const scope = { activeProjectId: "project", userId: "user" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.count.mockResolvedValue(1);
  mocks.locale.mockResolvedValue({ locale: "en" });
});
it.each(localeValues)(
  "CN-4 feed renders both structured summaries in %s without writing copy",
  async (locale) => {
    for (const type of ["manual_run_summary", "scheduled_window_summary"]) {
      const stored = { ...row, type };
      const original = structuredClone(stored);
      mocks.findMany.mockResolvedValue([stored]);
      const en = await getNotificationFeedForScope(scope, { limit: 1, locale: "en" });
      mocks.locale.mockResolvedValue({ locale });
      const feed = await getNotificationFeedForScope(scope, { limit: 1 });
      const item = feed.items[0];
      if (!item) throw new Error("Missing summary fixture");
      expect(item.title).not.toBe(stored.title);
      expect(item.body).not.toContain(stored.body);
      expect(item.meta).toBe(item.body);
      expect(item.body?.match(/\d/g)).toEqual(["1", "2", "3", "4", "5", "6"]);
      if (locale !== "en") {
        expect(item.title).not.toBe(en.items[0]?.title);
        expect(item.body).not.toBe(en.items[0]?.body);
      }
      if (type === "scheduled_window_summary") expect(item.title).toContain("00:00–01:00 UTC");
      expect(stored).toEqual(original);
    }
  },
);
it.each(localeValues)(
  "CN-4 feed with a linked incident does not repeat review wording in %s",
  async (locale) => {
    mocks.findMany.mockResolvedValue([
      {
        ...row,
        payload: {
          ...row.payload,
          counts: { under_review: 4 },
          linkedIncidentIds: ["internal-incident"],
        },
      },
    ]);
    const feed = await getNotificationFeedForScope(scope, { limit: 1, locale });
    expect(feed.items[0]?.body).not.toContain("4");
    expect(feed.items[0]?.body).toContain("1");
  },
);
