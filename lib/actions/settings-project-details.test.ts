import {
  getSettingsActionMocks,
  mockSettingsActor,
  resetSettingsActionMocks,
} from "@/lib/actions/settings-test-harness";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const settingsActionMocks = getSettingsActionMocks();
let actions: typeof import("@/lib/actions/settings");

beforeAll(async () => {
  actions = await import("@/lib/actions/settings");
});

describe("settings project actions", () => {
  beforeEach(resetSettingsActionMocks);

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects invalid project details before reading the session", async () => {
    await expect(
      actions.updateProjectDetails({
        domain: "bad",
        name: "",
        projectId: "prj_abcdefghijklmnopqrstuvwx",
      }),
    ).rejects.toThrow();

    expect(settingsActionMocks.requireSession).not.toHaveBeenCalled();
  });

  it("updates the project name without accepting a caller-supplied domain", async () => {
    settingsActionMocks.prisma.project.findUnique.mockResolvedValue({
      domain: "old.example.com",
      name: "Old",
      publicId: "prj_abcdefghijklmnopqrstuvwx",
      trackingScope: "global",
    });
    settingsActionMocks.prisma.project.update.mockImplementation(({ data }) =>
      Promise.resolve({
        ...data,
        domain: "old.example.com",
        trackingScope: "global",
        publicId: "prj_abcdefghijklmnopqrstuvwx",
      }),
    );

    const result = await actions.updateProjectDetails({
      domain: "changed.example.com",
      name: "Example",
      projectId: "prj_abcdefghijklmnopqrstuvwx",
    });

    expect(settingsActionMocks.prisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: "Example" } }),
    );
    expect(result).toMatchObject({
      domain: "old.example.com",
      name: "Example",
      projectId: "prj_abcdefghijklmnopqrstuvwx",
      trackingScope: "country",
    });
    expect(settingsActionMocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "settings.project_details.update" }),
    );
  });

  it("persists tracking scope with manage authorization and audit", async () => {
    mockSettingsActor("admin");
    settingsActionMocks.prisma.project.findUnique.mockResolvedValue({
      publicId: "prj_abcdefghijklmnopqrstuvwx",
      trackingScope: "global",
    });
    settingsActionMocks.prisma.project.update.mockResolvedValue({
      publicId: "prj_abcdefghijklmnopqrstuvwx",
      trackingScope: "city",
    });

    const result = await actions.updateProjectTrackingScope({
      projectId: "prj_abcdefghijklmnopqrstuvwx",
      trackingScope: "city",
    });

    expect(settingsActionMocks.prisma.project.update).toHaveBeenCalledWith({
      data: { trackingScope: "city" },
      select: { publicId: true, trackingScope: true },
      where: { id: "project_1" },
    });
    expect(result).toEqual({ projectId: "prj_abcdefghijklmnopqrstuvwx", trackingScope: "city" });
    expect(settingsActionMocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "settings.project_tracking_scope.update",
        after: { publicId: "prj_abcdefghijklmnopqrstuvwx", trackingScope: "city" },
        before: { publicId: "prj_abcdefghijklmnopqrstuvwx", trackingScope: "global" },
      }),
    );
  });

  it("requires admin access to update tracking scope", async () => {
    mockSettingsActor("member");

    await expect(
      actions.updateProjectTrackingScope({
        projectId: "prj_abcdefghijklmnopqrstuvwx",
        trackingScope: "country",
      }),
    ).rejects.toBeInstanceOf(settingsActionMocks.AuthorizationError);

    expect(settingsActionMocks.prisma.project.update).not.toHaveBeenCalled();
  });
});
