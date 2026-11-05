import { AuthorizationError } from "@/lib/auth/authorize";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiContext } from "./context";
import { ApiForbiddenError } from "./errors";
import {
  getProjectNotificationPreferences,
  updateProjectNotificationPreferences,
} from "./notification-prefs";
import { resourceSchemas } from "./openapi-resource-components";

const mocks = vi.hoisted(() => ({
  PreferenceWriteError: class PreferenceWriteError extends Error {},
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
  PreferenceWriteError: mocks.PreferenceWriteError,
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
  const url = new URL("https://example.com/api/v1/projects/prj_1/notification-preferences");
  return {
    actor: { id: "user_1", memberships: [{ projectId: "project_1", role }] },
    actorId: "user_1",
    auth: { project: { id: "project_1", publicId: "prj_1" } },
    headers: new Headers(),
    instance: "urn:test",
    method,
    origin: {
      credentialId: "key_test",
      credentialKind: "project_key",
      source: "api",
      surface: "programmatic",
    },
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
    mocks.update.mockImplementation(async (_actor: unknown, input: Record<string, unknown>) => {
      mocks.read.mockResolvedValue({ ...currentPreferences, ...input });
      return {
        warnings:
          input.checkInApp === undefined
            ? undefined
            : [{ code: "deprecated_field", field: "check_in_app", message: "Ignored" }],
      };
    });
  });

  it("lets a member change a personal channel that is not Slack or webhook", async () => {
    const response = await updateProjectNotificationPreferences(
      context("member", { alert_email: false }),
      "prj_1",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ alert_email: false });
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ id: "user_1" }), {
      alertEmail: false,
      projectId: "prj_1",
    });
  });

  it("documents project channel patch fields as deprecated, not removed", () => {
    expect(resourceSchemas.NotificationPreferencesPatch.properties).toMatchObject({
      alert_slack: { deprecated: true, type: "boolean" },
      alert_webhook: { deprecated: true, type: "boolean" },
    });
    expect(resourceSchemas.NotificationPreferences.properties).toHaveProperty("alert_slack");
    expect(resourceSchemas.NotificationPreferencesUpdated.properties).toHaveProperty(
      "alert_webhook",
    );
  });

  it.each([
    ["alert_slack", "alertSlack"],
    ["alert_webhook", "alertWebhook"],
  ])(
    "accepts legacy field %s from a member and forwards it for the service to ignore",
    async (field, key) => {
      mocks.update.mockResolvedValueOnce({
        warnings: [{ code: "deprecated_field", field, message: "Ignored" }],
      });
      const response = await updateProjectNotificationPreferences(
        context("member", { [field]: true }),
        "prj_1",
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("Deprecation")).toBe("@1792800000");
      await expect(response.json()).resolves.toMatchObject({
        [field]: false,
        warnings: [{ code: "deprecated_field", field }],
      });
      expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ id: "user_1" }), {
        [key]: true,
        projectId: "prj_1",
      });
    },
  );

  it("answers PATCH with the saved preferences only, not the account fields GET adds", async () => {
    mocks.update.mockImplementation(async (_actor: unknown, input: Record<string, unknown>) => {
      mocks.read.mockResolvedValue({
        ...currentPreferences,
        ...input,
        email: "member@example.com",
        emailVerification: "verified",
        slackAvailable: true,
        webhookAvailable: false,
      });
      return {};
    });
    const response = await updateProjectNotificationPreferences(
      context("member", { invite_email: false }),
      "prj_1",
    );

    const body = await response.json();
    expect(body).toMatchObject({ alert_slack: false, invite_email: false });
    for (const field of ["email", "email_verification", "slack_available", "webhook_available"]) {
      expect(body).not.toHaveProperty(field);
    }
  });

  it("preserves authorization failures instead of returning a write error", async () => {
    mocks.update.mockRejectedValue(new AuthorizationError("forbidden"));
    await expect(
      updateProjectNotificationPreferences(context("member", { alert_email: false }), "prj_1"),
    ).rejects.toBeInstanceOf(ApiForbiddenError);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("returns current preferences when a write result is unconfirmed", async () => {
    mocks.update.mockRejectedValue(new mocks.PreferenceWriteError("write failed"));
    const response = await updateProjectNotificationPreferences(
      context("member", { alert_email: false }),
      "prj_1",
    );
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      details: { current_preferences: { alert_email: true } },
    });
  });

  it("preserves the legacy warning on a partial write", async () => {
    const response = await updateProjectNotificationPreferences(
      context("member", { check_in_app: false }),
      "prj_1",
    );
    expect(response.headers.get("Deprecation")).toBe("@1792800000");
    await expect(response.json()).resolves.toMatchObject({ warnings: [{ field: "check_in_app" }] });
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
