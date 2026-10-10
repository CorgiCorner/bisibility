import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  schedule: {
    id: "internal_schedule",
    publicId: "ais_saved",
    projectId: "project",
    name: "Saved",
    cron: "0 9 * * 1",
    timezone: "UTC",
    enabled: true,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    nextRunAt: new Date(),
    configuration: {
      promptIds: ["saved_prompt"],
      configurations: [],
      actorId: "original_creator",
      credentialConnectionId: "original_connection",
      credentialVersion: "saved_credentials",
      budgetRevision: "saved_budget",
      consentRevision: "saved_consent",
      idempotencyKey: "saved_key",
    },
  },
  audit: vi.fn(),
  mutation: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("./_shared", () => ({
  requireProjectScope: vi.fn(),
  getActionActor: async () => ({
    id: "editor",
    memberships: [{ projectId: "project", role: "admin" }],
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/api/ai-tracking-audit", () => ({
  auditTrackingCatalog: state.audit,
  auditTrackingRun: state.audit,
}));
vi.mock("@/lib/api/ai-tracking-service", async (original) => ({
  ...(await original<typeof import("@/lib/api/ai-tracking-service")>()),
  trackingScope: async () => ({ id: "project", publicId: "prj_public", domain: "example.test" }),
  trackingCatalog: async (_project: string, resource: string) =>
    resource === "schedules" ? [state.schedule] : [],
  trackingRuns: async () => ({ items: [], nextCursor: null }),
  trackingLaunch: vi.fn(),
  trackingRunOperation: vi.fn(),
  trackingSamples: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    aiTrackingSchedule: { findMany: async () => [state.schedule] },
    $transaction: async (execute: (tx: unknown) => Promise<unknown>) => {
      state.transaction();
      return execute({
        $queryRaw: async () => [],
        project: { findUnique: async () => ({ id: "project" }) },
        aiTrackingSchedule: {
          findFirst: async () => state.schedule,
          update: async ({ data }: { data: Record<string, unknown> }) => {
            Object.assign(
              state.schedule,
              Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)),
            );
            return state.schedule;
          },
        },
      });
    },
  },
}));

import { mutateAiTrackingAction } from "./ai-tracking";

beforeEach(() => {
  state.schedule.enabled = true;
  vi.clearAllMocks();
});
describe("schedule metadata edit admission", () => {
  it("preserves saved prompt selection, creator, credentials and budget consent through the actual store", async () => {
    const before = structuredClone(state.schedule.configuration);
    await mutateAiTrackingAction(
      "prj_public",
      "schedules",
      "PATCH",
      {
        name: "Renamed",
        cron: "0 10 * * 1",
        timezone: "Europe/Warsaw",
        enabled: true,
      },
      "ais_saved",
    );
    expect(state.schedule.configuration).toEqual(before);
    expect(state.schedule).toMatchObject({ name: "Renamed", enabled: true });
    expect(state.audit).toHaveBeenCalledWith(
      expect.objectContaining({ id: "editor" }),
      expect.anything(),
      "schedules",
      "PATCH",
      expect.objectContaining({ name: "Renamed" }),
      expect.anything(),
    );
  });
  it("blocks a disabled schedule from enabling without explicit reviewed configuration", async () => {
    state.schedule.enabled = false;
    await expect(
      mutateAiTrackingAction("prj_public", "schedules", "PATCH", { enabled: true }, "ais_saved"),
    ).rejects.toThrow("explicit budget consent");
    expect(state.transaction).not.toHaveBeenCalled();
    expect(state.audit).not.toHaveBeenCalled();
  });
});
