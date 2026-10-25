import { beforeEach, expect, it, vi } from "vitest";
import { getNotificationFeedForScope, notificationFeedSignature } from "./feed";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), count: vi.fn(), locale: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { notification: { findMany: mocks.findMany, count: mocks.count } },
}));
vi.mock("@/lib/queries/account", () => ({ getLocalePreferenceForUser: mocks.locale }));
const row = {
  title: "Stored English must never win",
  body: "Stored body must never win",
  payload: {
    incidentId: "internal-incident",
    href: "/app/rank-tracker?incident=internal-incident",
    state: "open",
    resultRecoveredCount: 1,
    costUnknownCount: 1,
  },
  type: "provider_incident",
  version: 1,
  withdrawnAt: null,
  createdAt: new Date("2026-06-01T00:00:00Z"),
  readAt: null,
  publicId: "ntf_abcdefghijklmnopqrstuvwx",
  project: { publicId: "prj_abcdefghijklmnopqrstuvwx", name: "Fixture", domain: "example.test" },
};
const scope = { activeProjectId: "project", userId: "user" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.findMany.mockResolvedValue([row]);
  mocks.count.mockResolvedValue(1);
  mocks.locale.mockResolvedValue({ locale: "en" });
});
it("IN-4 same stored row re-renders after reader locale changes without a write", async () => {
  const original = structuredClone(row);
  const en = await getNotificationFeedForScope(scope, { limit: 1 });
  expect(en.items[0]).toMatchObject({
    title: "Provider evidence review",
    body: expect.stringContaining("1 recovered result; cost unknown for 1 check"),
  });
  mocks.locale.mockResolvedValue({ locale: "pl" });
  const pl = await getNotificationFeedForScope(scope, { limit: 1 });
  expect(pl.items[0]?.title).toBe("Weryfikacja danych dostawcy");
  expect(pl.items[0]?.body).not.toBe(en.items[0]?.body);
  expect(row).toEqual(original);
  expect(JSON.stringify(en)).not.toContain("internal-incident");
  expect(en.items[0]?.payload).toMatchObject({ incidentId: "[redacted]" });
  expect(en.items[0]?.href).toBe("/app/prj_abcdefghijklmnopqrstuvwx/runs");
});
it("IN-6 version and withdrawal change the polling signature even with unchanged text/readAt/time", async () => {
  const before = await getNotificationFeedForScope(scope, { limit: 1 });
  const item = before.items[0];
  if (!item) throw new Error("Missing item");
  const updated = { ...before, items: [{ ...item, version: 2 }] };
  const withdrawn = { ...before, items: [{ ...item, withdrawnAt: new Date().toISOString() }] };
  expect(notificationFeedSignature(before)).not.toBe(notificationFeedSignature(updated));
  expect(notificationFeedSignature(before)).not.toBe(notificationFeedSignature(withdrawn));
  const oldSignature = (feed: typeof before) =>
    JSON.stringify(feed.items.map((entry) => [entry.id, entry.readAt, entry.time]));
  expect(oldSignature(before)).toBe(oldSignature(updated));
});

it.each(["en", "pl", "ja", "es-ES"] as const)(
  "IN-4 maps every dimension from the same stored row in %s",
  async (locale) => {
    const stored = {
      ...row,
      payload: {
        ...row.payload,
        resultUnderReviewCount: 2,
        resultRecoveredCount: 2,
        resultPartialCount: 2,
        resultProviderErrorCount: 2,
        resultMissingCount: 2,
        costMeasuredCount: 2,
        costUnknownCount: 2,
        costUnderReviewCount: 2,
      },
    };
    const before = structuredClone(stored);
    mocks.findMany.mockResolvedValue([stored]);
    mocks.locale.mockResolvedValue({ locale });
    const feed = await getNotificationFeedForScope(scope, { limit: 1 });
    expect(feed.items[0]?.body?.match(/2/g)).toHaveLength(8);
    expect(feed.items[0]?.title).not.toBe(stored.title);
    expect(feed.items[0]?.body).not.toContain(stored.body);
    expect(stored).toEqual(before);
  },
);

it("IN-4 legacy project-less incident rows never expose an internal href", async () => {
  mocks.findMany.mockResolvedValue([{ ...row, project: null }]);
  const feed = await getNotificationFeedForScope({ ...scope, activeProjectId: null }, { limit: 1 });
  expect(feed.items[0]?.href).toBe("/app");
  expect(JSON.stringify(feed)).not.toContain("internal-incident");
});
