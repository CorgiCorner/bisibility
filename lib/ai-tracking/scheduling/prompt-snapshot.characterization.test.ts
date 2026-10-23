/**
 * Characterization: AI tracking schedules target a prompt snapshot.
 *
 * Characterization only; expectations were recorded by running the current code. The fake
 * `aiPrompt.findMany` evaluates the sweep's own `where` against in-memory prompts and throws on
 * any field it does not understand.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Prompt = {
  archivedAt: Date | null;
  id: string;
  pausedAt: Date | null;
  projectId: string;
  topicId: string | null;
};
type PromptWhere = {
  OR?: Array<{ topicId?: null; topic?: { archivedAt: null; pausedAt: null } }>;
  archivedAt?: null;
  id?: { in: string[] };
  pausedAt?: null;
  projectId?: string;
};

const NOW = new Date("2026-10-21T12:00:00.000Z");

const mocks = vi.hoisted(() => ({
  launchTrackingRun: vi.fn(),
  prompts: [] as Prompt[],
  upsert: vi.fn(),
}));

function promptMatches(prompt: Prompt, where: PromptWhere) {
  for (const key of Object.keys(where)) {
    if (!["OR", "archivedAt", "id", "pausedAt", "projectId"].includes(key)) {
      throw new Error(`Unsupported prompt filter: ${key}`);
    }
  }
  if (where.projectId !== undefined && prompt.projectId !== where.projectId) return false;
  if (where.archivedAt === null && prompt.archivedAt !== null) return false;
  if (where.pausedAt === null && prompt.pausedAt !== null) return false;
  if (where.id && !where.id.in.includes(prompt.id)) return false;
  // Every fixture topic is active, so either OR branch admits a prompt.
  return true;
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    aiPrompt: {
      findMany: async ({ where }: { where: PromptWhere }) =>
        mocks.prompts.filter((prompt) => promptMatches(prompt, where)).map(({ id }) => ({ id })),
    },
    aiTrackingRun: { upsert: mocks.upsert },
    aiTrackingSchedule: {
      findMany: async () => [
        {
          archivedAt: null,
          configuration: {
            actorId: "actor",
            budgetRevision: "budget",
            configurations: [{ engine: "chatgpt" }],
            consentRevision: "consent",
            credentialConnectionId: "connection",
            credentialVersion: "version",
            promptIds: ["prompt-at-creation"],
          },
          cron: "0 12 * * *",
          enabled: true,
          id: "schedule",
          nextRunAt: NOW,
          projectId: "project",
          timezone: "UTC",
        },
      ],
      updateMany: async () => ({ count: 1 }),
    },
  },
}));
vi.mock("@/lib/ai-tracking/admission/launch", () => ({
  launchTrackingRun: mocks.launchTrackingRun,
}));
vi.mock("@/lib/db/public-id-resources", () => ({ makePublicId: () => "air_run" }));

import { planDueTrackingSchedules } from "./sweep";

function prompt(id: string): Prompt {
  return { archivedAt: null, id, pausedAt: null, projectId: "project", topicId: null };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.launchTrackingRun.mockResolvedValue({ id: "run" });
  mocks.prompts.splice(0, mocks.prompts.length, prompt("prompt-at-creation"));
});

describe("AI tracking schedule targets", () => {
  it("runs only configuration.promptIds and ignores an active prompt added later", async () => {
    mocks.prompts.push(prompt("prompt-added-later"));

    expect(await planDueTrackingSchedules(NOW)).toEqual({ planned: 1, skipped: 0 });
    expect(mocks.launchTrackingRun).toHaveBeenCalledTimes(1);
    expect(mocks.launchTrackingRun.mock.calls[0]?.[1]).toMatchObject({
      origin: "scheduled",
      promptIds: ["prompt-at-creation"],
      scheduleId: "schedule",
    });
  });

  it("skips the occurrence when every snapshot prompt is archived, even with new active prompts", async () => {
    mocks.prompts.splice(0, mocks.prompts.length, {
      ...prompt("prompt-at-creation"),
      archivedAt: new Date("2026-10-20T00:00:00.000Z"),
    });
    mocks.prompts.push(prompt("prompt-added-later"));

    expect(await planDueTrackingSchedules(NOW)).toEqual({ planned: 0, skipped: 1 });
    expect(mocks.launchTrackingRun).not.toHaveBeenCalled();
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ state: "skipped" }) }),
    );
  });
});
