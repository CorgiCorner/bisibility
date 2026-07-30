import { AuthorizationError } from "@/lib/auth/authorize";
import { hashApiKey } from "@/lib/providers/crypto";
import { appPath } from "@/lib/routing/app-path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createIngestHook,
  deleteIngestHook,
  disableIngestHook,
  rotateIngestHook,
  sendIngestHookTest,
} from "./ingest-hooks";

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    ingestHook: {
      create: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    project: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
  },
  requireSession: vi.fn(),
  revalidatePath: vi.fn(),
  writeAudit: vi.fn(),
  writeAuditFailure: vi.fn(),
  ingestDeployEvent: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/audit", () => ({
  writeAudit: mocks.writeAudit,
  writeAuditFailure: mocks.writeAuditFailure,
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/ingest/ingest-deploy-event", () => ({
  ingestDeployEvent: mocks.ingestDeployEvent,
}));

const project = {
  id: "project_1",
  ownerId: "user_1",
  publicId: "prj_a00000000000000000000000",
  writeMode: "active",
};

function mockActor(role: "admin" | "member" = "admin") {
  mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
  mocks.prisma.user.findUnique.mockResolvedValue({
    memberships: [{ projectId: "project_1", role }],
    role,
  });
}

function hook(overrides: Record<string, unknown> = {}) {
  return {
    disabled: false,
    id: "hook_1",
    label: "Production deploys",
    publicId: "dwh_a00000000000000000000000",
    ...overrides,
  };
}

describe("ingest hook actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActor();
    mocks.prisma.project.findFirst.mockResolvedValue(project);
    mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.prisma));
    mocks.prisma.ingestHook.findFirst.mockResolvedValue(hook());
    mocks.prisma.ingestHook.update.mockResolvedValue(hook({ disabled: true }));
    mocks.prisma.ingestHook.delete.mockResolvedValue(hook());
    mocks.writeAudit.mockResolvedValue({});
    mocks.writeAuditFailure.mockResolvedValue({});
    mocks.ingestDeployEvent.mockResolvedValue({
      signal: { id: "signal_1", publicId: "sig_a00000000000000000000000" },
      status: "created",
    });
  });

  it("requires admin-level project access", async () => {
    mockActor("member");

    await expect(
      createIngestHook({ label: "Production deploys", projectId: "prj_a00000000000000000000000" }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(mocks.prisma.ingestHook.create).not.toHaveBeenCalled();
  });

  it("returns a raw token once and stores only its hash", async () => {
    let stored: Record<string, unknown> | undefined;
    mocks.prisma.ingestHook.create.mockImplementation(({ data }) => {
      stored = data;
      return Promise.resolve(hook({ createdAt: new Date("2026-07-04T21:00:00.000Z") }));
    });

    const result = await createIngestHook({
      label: "Production deploys",
      projectId: "prj_a00000000000000000000000",
    });

    expect(result.raw).toMatch(/^bih_live_/);
    expect(result.id).toBe("dwh_a00000000000000000000000");
    expect(result).not.toHaveProperty("tokenHash");
    expect(stored?.tokenHash).toBe(hashApiKey(result.raw));
    expect(stored?.tokenHash).not.toContain(result.raw);
    expect(stored).not.toHaveProperty("raw");
    expect(stored?.createdById).toBe("user_1");
    expect(String(stored?.publicId)).toMatch(/^dwh_[a-z][a-z0-9]{23}$/);
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ingest_hook.create",
        targetId: "dwh_a00000000000000000000000",
      }),
    );
  });

  it("disables an active hook and audits the change", async () => {
    const result = await disableIngestHook({
      hookId: "dwh_a00000000000000000000000",
      projectId: "prj_a00000000000000000000000",
    });

    expect(result).toEqual({
      disabled: true,
      id: "dwh_a00000000000000000000000",
      label: "Production deploys",
    });
    expect(mocks.prisma.ingestHook.update).toHaveBeenCalledWith({
      data: { disabled: true },
      select: { disabled: true, id: true, label: true, publicId: true },
      where: { id: "hook_1" },
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ingest_hook.disable",
        targetId: "dwh_a00000000000000000000000",
      }),
    );
  });

  it("guards against disabling an already disabled hook", async () => {
    mocks.prisma.ingestHook.findFirst.mockResolvedValue(hook({ disabled: true }));

    await expect(
      disableIngestHook({
        hookId: "dwh_a00000000000000000000000",
        projectId: "prj_a00000000000000000000000",
      }),
    ).rejects.toThrow("already disabled");
    expect(mocks.prisma.ingestHook.update).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("rotates the token in place and audits without exposing token hashes", async () => {
    let updateData: Record<string, unknown> | undefined;
    mocks.prisma.ingestHook.update.mockImplementation(({ data }) => {
      updateData = data;
      return Promise.resolve(hook());
    });

    const result = await rotateIngestHook({
      hookId: "dwh_a00000000000000000000000",
      projectId: "prj_a00000000000000000000000",
    });

    expect(result.raw).toMatch(/^bih_live_/);
    expect(result).toMatchObject({
      id: "dwh_a00000000000000000000000",
      label: "Production deploys",
      maskedValue: expect.stringMatching(/^bih_live_/),
    });
    expect(updateData?.tokenHash).toBe(hashApiKey(result.raw));
    expect(mocks.prisma.ingestHook.update).toHaveBeenCalledWith({
      data: { tokenHash: hashApiKey(result.raw) },
      select: { disabled: true, id: true, label: true, publicId: true },
      where: { id: "hook_1" },
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ingest_hook.rotate",
        after: {
          disabled: false,
          id: "dwh_a00000000000000000000000",
          label: "Production deploys",
        },
        before: {
          disabled: false,
          id: "dwh_a00000000000000000000000",
          label: "Production deploys",
        },
        targetId: "dwh_a00000000000000000000000",
      }),
      mocks.prisma,
    );
    expect(JSON.stringify(mocks.writeAudit.mock.calls)).not.toContain(result.raw);
    expect(JSON.stringify(mocks.writeAudit.mock.calls)).not.toContain(hashApiKey(result.raw));
  });

  it("does not rotate a disabled hook", async () => {
    mocks.prisma.ingestHook.findFirst.mockResolvedValue(hook({ disabled: true }));

    await expect(
      rotateIngestHook({
        hookId: "dwh_a00000000000000000000000",
        projectId: "prj_a00000000000000000000000",
      }),
    ).rejects.toThrow(/disabled/i);
    expect(mocks.prisma.ingestHook.update).not.toHaveBeenCalled();
  });

  it("sends a marked test event through the shared ingest path", async () => {
    const result = await sendIngestHookTest({
      hookId: "dwh_a00000000000000000000000",
      projectId: "prj_a00000000000000000000000",
    });

    expect(mocks.ingestDeployEvent).toHaveBeenCalledWith({
      actorId: "user_1",
      body: {
        deployment_id: expect.stringMatching(/^test_/),
        environment: "test",
        paths: ["/"],
      },
      hookId: "hook_1",
      projectId: "project_1",
      provider: null,
      test: true,
    });
    expect(result).toEqual({
      signalHref:
        "/app/prj_a00000000000000000000000/timeline?filter=deploys&q=sig_a00000000000000000000000#signal-sig_a00000000000000000000000",
      signalId: "sig_a00000000000000000000000",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(appPath("[project]", "timeline"), "page");
  });

  it("deletes a hook and writes an audit entry", async () => {
    await expect(
      deleteIngestHook({
        hookId: "dwh_a00000000000000000000000",
        projectId: "prj_a00000000000000000000000",
      }),
    ).resolves.toEqual({
      deleted: true,
      id: "dwh_a00000000000000000000000",
    });

    expect(mocks.prisma.ingestHook.delete).toHaveBeenCalledWith({ where: { id: "hook_1" } });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ingest_hook.delete",
        targetId: "dwh_a00000000000000000000000",
      }),
    );
  });
});
