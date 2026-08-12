import { NotificationType } from "@/lib/generated/prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  notifyCloudImportDone,
  notifyProjectMembers,
  notifyRankCheckCompleted,
  notifyTriggeredAlertDelivered,
} from "./events";

const mocks = vi.hoisted(() => ({
  createNotification: vi.fn(() => Promise.resolve({ id: "notification_1" })),
  prisma: {
    keyword: { findUnique: vi.fn() },
    notification: { findFirst: vi.fn() },
    project: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./create", () => ({ createNotification: mocks.createNotification }));

describe("notification event producers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.project.findUnique.mockResolvedValue({
      members: [{ userId: "member_1" }, { userId: "owner_1" }],
      ownerId: "owner_1",
      publicId: "prj_1",
    });
    mocks.prisma.notification.findFirst.mockResolvedValue(null);
  });

  it("fans out project notifications to unique owner and member recipients", async () => {
    await notifyProjectMembers({
      body: "Import done",
      idempotencyKey: "event_1",
      payload: { href: "/app/integrations" },
      projectId: "project_1",
      title: "Import complete",
      type: NotificationType.import_done,
    });

    expect(mocks.prisma.project.findUnique).toHaveBeenCalledWith({
      select: { members: { select: { userId: true } }, ownerId: true, publicId: true },
      where: { id: "project_1" },
    });
    expect(mocks.createNotification).toHaveBeenCalledTimes(2);
    expect(mocks.createNotification).toHaveBeenCalledWith(
      "owner_1",
      "project_1",
      NotificationType.import_done,
      "Import complete",
      "Import done",
      expect.objectContaining({ href: "/app/integrations", idempotencyKey: "event_1" }),
      "event_1",
    );
    expect(mocks.createNotification).toHaveBeenCalledWith(
      "member_1",
      "project_1",
      NotificationType.import_done,
      "Import complete",
      "Import done",
      expect.objectContaining({ idempotencyKey: "event_1" }),
      "event_1",
    );
  });

  it("notifyRankCheckCompleted skips when position is unchanged", async () => {
    await notifyRankCheckCompleted({
      checkedAt: new Date("2026-07-21T00:00:00.000Z"),
      keywordId: "keyword_1",
      position: 5,
      previousPosition: 5,
      projectId: "project_1",
      rankCheckId: "rc_1",
    });

    expect(mocks.prisma.keyword.findUnique).not.toHaveBeenCalled();
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  it("notifyRankCheckCompleted skips when both positions are null", async () => {
    await notifyRankCheckCompleted({
      checkedAt: new Date("2026-07-21T00:00:00.000Z"),
      keywordId: "keyword_1",
      position: null,
      previousPosition: null,
      projectId: "project_1",
      rankCheckId: "rc_1",
    });

    expect(mocks.prisma.keyword.findUnique).not.toHaveBeenCalled();
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  it("notifyRankCheckCompleted notifies members when position changed", async () => {
    mocks.prisma.keyword.findUnique.mockResolvedValue({
      project: { domain: "example.com" },
      publicId: "kw_public_1",
      text: "rank tracker",
    });

    await notifyRankCheckCompleted({
      checkedAt: new Date("2026-07-21T00:00:00.000Z"),
      keywordId: "keyword_1",
      position: 4,
      previousPosition: 5,
      projectId: "project_1",
      rankCheckId: "rc_1",
    });

    expect(mocks.createNotification).toHaveBeenCalledTimes(2);
    expect(mocks.createNotification).toHaveBeenCalledWith(
      expect.any(String),
      "project_1",
      NotificationType.check_complete,
      "Rank check complete",
      "rank tracker is #4.",
      expect.objectContaining({ idempotencyKey: "rank-check:rc_1:complete" }),
      "rank-check:rc_1:complete",
    );
  });

  it("uses raw identities for alert notification persistence and public IDs in its payload", async () => {
    await notifyTriggeredAlertDelivered({
      payload: {
        action: "Review it.",
        afterPosition: 12,
        alertId: "al_a00000000000000000000000",
        beforePosition: 4,
        conditionType: "position_drop",
        firedAt: "2026-07-27T12:00:00.000Z",
        headline: "Ranking dropped",
        keyword: "rank tracker",
        keywordId: "kw_a00000000000000000000000",
        projectDomain: "example.com",
        projectId: "prj_a00000000000000000000000",
        ruleId: "alr_a00000000000000000000000",
        ruleName: "Drop",
      },
      projectInternalId: "project_db_1",
      triggeredAlertId: "triggered_alert_db_1",
    });

    expect(mocks.prisma.project.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "project_db_1" } }),
    );
    expect(mocks.createNotification).toHaveBeenCalledWith(
      expect.any(String),
      "project_db_1",
      NotificationType.alert_fired,
      "Ranking dropped",
      "Review it.",
      expect.objectContaining({
        alertId: "al_a00000000000000000000000",
        idempotencyKey: "triggered-alert:triggered_alert_db_1:delivered",
        ruleId: "alr_a00000000000000000000000",
      }),
      "triggered-alert:triggered_alert_db_1:delivered",
    );
  });

  it("skips recipients that already have the same event notification", async () => {
    mocks.prisma.notification.findFirst
      .mockResolvedValueOnce({ id: "existing_1" })
      .mockResolvedValueOnce(null);

    await notifyCloudImportDone({
      counts: { history: 2, history_skipped: 1, keywords: 42, keywords_created: 40 },
      jobId: "job_1",
      projectId: "project_1",
    });

    expect(mocks.prisma.notification.findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: { idempotencyKey: "cloud-import:job_1:done", userId: "owner_1" },
    });
    expect(mocks.createNotification).toHaveBeenCalledTimes(1);
    expect(mocks.createNotification).toHaveBeenCalledWith(
      "member_1",
      "project_1",
      NotificationType.import_done,
      "Instance import complete",
      "Imported 40 new keywords, 2 history rows. 1 history row skipped.",
      expect.objectContaining({
        href: "/app/prj_1/rank-tracker",
        idempotencyKey: "cloud-import:job_1:done",
      }),
      "cloud-import:job_1:done",
    );
  });

  it("summarizes an import where everything already existed", async () => {
    await notifyCloudImportDone({
      counts: { history: 0, history_received: 3, keywords: 1, keywords_skipped: 1 },
      jobId: "job_2",
      projectId: "project_1",
    });

    expect(mocks.createNotification).toHaveBeenCalledWith(
      "owner_1",
      "project_1",
      NotificationType.import_done,
      "Instance import complete",
      "Processed 1 keyword - nothing new to import. 1 keyword skipped.",
      expect.objectContaining({ href: "/app/prj_1/rank-tracker" }),
      "cloud-import:job_2:done",
    );
  });
});
