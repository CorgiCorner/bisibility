import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiContext } from "./context";
import {
  getProjectNotificationPreferences,
  updateProjectNotificationPreferences,
} from "./notification-prefs";

const mocks = vi.hoisted(() => ({
  cookieBound: vi.fn(),
  read: vi.fn(),
  update: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/queries/notification-prefs", () => ({
  getNotificationPreferences: mocks.cookieBound,
  readNotificationPreferencesFor: mocks.read,
}));
vi.mock("@/lib/notifications/preferences-update", () => ({
  applyNotificationPreferences: mocks.update,
}));

const currentPreferences = {
  alertEmail: true,
  alertInApp: true,
  alertSlack: false,
  alertWebhook: false,
  checkEmail: false,
  checkInApp: false,
  importEmail: true,
  importInApp: true,
  inviteEmail: true,
  inviteInApp: true,
  projectId: "project_1",
};

function context(role: "admin" | "member", body: unknown, method: "GET" | "PATCH" = "PATCH") {
  const url = new URL("https://example.test/api/v1/projects/prj_1/notification-preferences");
  return {
    actor: { id: "user_1", memberships: [{ projectId: "project_1", role }] },
    actorId: "user_1",
    auth: { project: { id: "project_1", publicId: "prj_1" } },
    headers: new Headers(),
    instance: "urn:test",
    method,
    path: [],
    req:
      method === "GET"
        ? new Request(url, { method })
        : new Request(url, { body: JSON.stringify(body), method }),
    url,
  } as unknown as ApiContext;
}

describe("notification preference REST updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.read.mockResolvedValue({ ...currentPreferences });
    mocks.update.mockImplementation(async (_actor: unknown, input: Record<string, unknown>) => ({
      ...currentPreferences,
      ...input,
    }));
  });

  it("lets a member change a personal channel that is not Slack or webhook", async () => {
    const response = await updateProjectNotificationPreferences(
      context("member", { alert_email: false }),
      "prj_1",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ alert_email: false });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user_1" }),
      expect.objectContaining({ alertEmail: false, alertSlack: false, projectId: "prj_1" }),
    );
  });

  it("refuses a member flipping Slack delivery", async () => {
    const response = await updateProjectNotificationPreferences(
      context("member", { alert_slack: true }),
      "prj_1",
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      status: 403,
      title: "Forbidden",
      type: "https://bisibility.com/problems/forbidden",
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("refuses a member flipping webhook delivery", async () => {
    const response = await updateProjectNotificationPreferences(
      context("member", { alert_webhook: true }),
      "prj_1",
    );

    expect(response.status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("lets an admin flip Slack delivery", async () => {
    const response = await updateProjectNotificationPreferences(
      context("admin", { alert_slack: true }),
      "prj_1",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ alert_slack: true });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user_1" }),
      expect.objectContaining({ alertSlack: true }),
    );
  });

  it("uses actor-explicit reads for bearer requests without reaching the cookie-bound query", async () => {
    mocks.cookieBound.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    const read = await getProjectNotificationPreferences(
      context("admin", undefined, "GET"),
      "prj_1",
    );
    const update = await updateProjectNotificationPreferences(
      context("admin", { alert_email: false }),
      "prj_1",
    );

    expect([read.status, update.status]).toEqual([200, 200]);
    expect(mocks.read).toHaveBeenCalledWith(expect.objectContaining({ id: "user_1" }), "prj_1");
    expect(mocks.cookieBound).not.toHaveBeenCalled();
  });
});
