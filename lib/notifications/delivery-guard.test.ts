import { makePublicId } from "@/lib/db/public-id";
import { NotificationType } from "@/lib/generated/prisma/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { guardedNotificationType, notificationDeliveryAllowed } from "./delivery-guard";
import { notificationPreferencesForMissingRow } from "./preference-defaults";
import { incidentUpdateMarksUnread } from "./upsert";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
const db = {
  $queryRaw: vi.fn(),
  project: { findFirst: vi.fn() },
  notificationPreference: { findUnique: vi.fn() },
};
const guard = (type: NotificationType, project: string | null = "p") =>
  notificationDeliveryAllowed(db as never, "u", project, type);
beforeEach(() => {
  vi.stubEnv("PROVIDER_RECOVERY", "on");
  db.project.findFirst.mockResolvedValue({ id: "p" });
  db.notificationPreference.findUnique.mockResolvedValue(null);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("exhaustively classifies every enum value; no new type silently bypasses the guard", () => {
  expect(Object.values(NotificationType).filter(guardedNotificationType).sort()).toEqual([
    "manual_run_summary",
    "provider_incident",
    "scheduled_window_summary",
  ]);
  expect(() => guardedNotificationType("future_type" as NotificationType)).toThrow(
    "Unhandled notification type",
  );
});
it.each(["provider_incident", "manual_run_summary", "scheduled_window_summary"] as const)(
  "%s requires project and current membership",
  async (type) => {
    expect(await guard(type, null)).toBe(false);
    db.project.findFirst.mockResolvedValue(null);
    expect(await guard(type)).toBe(false);
  },
);
it("uses shared defaults, independent incident toggle and summary None", async () => {
  expect(await guard("provider_incident")).toBe(true);
  expect(await guard("manual_run_summary")).toBe(true);
  db.notificationPreference.findUnique.mockResolvedValue({
    ...notificationPreferencesForMissingRow(),
    providerIncidentInApp: false,
  });
  expect(await guard("provider_incident")).toBe(false);
  expect(await guard("manual_run_summary")).toBe(true);
  db.notificationPreference.findUnique.mockResolvedValue({
    ...notificationPreferencesForMissingRow(),
    checkNotificationSetting: "none",
  });
  expect(await guard("manual_run_summary")).toBe(false);
  expect(await guard("scheduled_window_summary")).toBe(false);
  expect(await guard("provider_incident")).toBe(true);
});
it("off and demo suppress only incident delivery", async () => {
  vi.stubEnv("PROVIDER_RECOVERY", "off");
  expect(await guard("provider_incident")).toBe(false);
  expect(await guard("alert_fired")).toBe(true);
  vi.stubEnv("PROVIDER_RECOVERY", "on");
  vi.stubEnv("READ_ONLY_DEMO", "1");
  vi.stubEnv("DEMO_USER_ID", makePublicId("usr"));
  vi.stubEnv("DEMO_PROJECT_ID", makePublicId("prj"));
  expect(await guard("provider_incident")).toBe(false);
});
it("only a new unresolved link marks an existing incident unread", () => {
  expect(incidentUpdateMarksUnread("provider_incident", true)).toBe(true);
  expect(incidentUpdateMarksUnread("provider_incident", false)).toBe(false);
  expect(incidentUpdateMarksUnread("manual_run_summary", true)).toBe(false);
});

it("IN-9 locks the project before the live retirement and membership guard", async () => {
  expect(await guard("provider_incident")).toBe(true);
  expect(db.$queryRaw).toHaveBeenCalledOnce();
  expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
    db.project.findFirst.mock.invocationCallOrder[0],
  );
});
