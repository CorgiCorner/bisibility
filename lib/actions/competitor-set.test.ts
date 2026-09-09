import { Prisma } from "@/lib/generated/prisma/client";
import { appPath } from "@/lib/routing/app-path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addManualCompetitor,
  confirmSuggestedCompetitor,
  dismissCompetitorSuggestion,
  skipCompetitorSetup,
  updateCompetitorAliases,
} from "./competitor-set";
import { addManagedCompetitor } from "./competitors";

const competitorPublicId = "cmp_abcdefghijklmnopqrstuvwx";
const projectPublicId = "prj_abcdefghijklmnopqrstuvwx";

type SetupOutcome = "confirmed" | "skipped";
type SetupOutcomeCondition = {
  NOT?: { competitorSetupOutcome: SetupOutcome };
  competitorSetupOutcome?: null;
};
type SetupOutcomeUpdate = {
  data: { competitorSetupDecidedAt: Date; competitorSetupOutcome: SetupOutcome };
  where: SetupOutcomeCondition & { OR?: SetupOutcomeCondition[] };
};

const mocks = vi.hoisted(() => {
  class AuthorizationError extends Error {
    constructor() {
      super("You are not authorized to perform this action.");
    }
  }
  const prisma = {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    competitor: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    competitorSuggestionDismissal: { upsert: vi.fn() },
    project: { findFirst: vi.fn(), updateMany: vi.fn() },
    user: { findUnique: vi.fn() },
  };
  prisma.$transaction.mockImplementation((callback) => callback(prisma));
  return {
    AuthorizationError,
    getCompetitorSuggestions: vi.fn(),
    prisma,
    requireSession: vi.fn(),
    revalidatePath: vi.fn(),
    writeAudit: vi.fn(),
  };
});

vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (value: string) => value,
  writeAudit: mocks.writeAudit,
}));
vi.mock("@/lib/auth/authorize", () => ({
  AuthorizationError: mocks.AuthorizationError,
  authorize: vi.fn((actor, _action, resource) => {
    const role = actor.memberships.find(
      (item: { projectId: string }) => item.projectId === resource.projectId,
    )?.role;
    if (!role || role === "viewer") throw new mocks.AuthorizationError();
  }),
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/competitors/suggestions", () => ({
  getCompetitorSuggestions: mocks.getCompetitorSuggestions,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

function actor(role: "member" | "viewer" = "member") {
  mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
  mocks.prisma.user.findUnique.mockResolvedValue({
    memberships: [{ projectId: "project_1", role }],
    role,
  });
}

function competitor(overrides: Record<string, unknown> = {}) {
  return {
    aliases: [],
    domain: "competitor.example.com",
    evidence: null,
    id: "competitor_1",
    label: null,
    publicId: competitorPublicId,
    scopePolicy: "all_markets",
    source: "manual",
    ...overrides,
  };
}

function freshProjectSetup() {
  let decidedAt: Date | null = null;
  let outcome: SetupOutcome | null = null;
  mocks.prisma.project.updateMany.mockImplementation(({ data, where }: SetupOutcomeUpdate) => {
    const conditions = where.OR ?? [where];
    const matches = conditions.some((condition) => {
      if (condition.competitorSetupOutcome === null) return outcome === null;
      const expected = condition.NOT?.competitorSetupOutcome;
      return expected !== undefined && outcome !== null && outcome !== expected;
    });
    if (matches) {
      decidedAt = data.competitorSetupDecidedAt;
      outcome = data.competitorSetupOutcome;
    }
    return Promise.resolve({ count: matches ? 1 : 0 });
  });
  return { decidedAt: () => decidedAt, outcome: () => outcome };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  actor();
  mocks.prisma.project.findFirst.mockResolvedValue({
    id: "project_1",
    ownerId: "user_1",
    publicId: projectPublicId,
  });
  mocks.prisma.competitor.create.mockResolvedValue(competitor());
  mocks.prisma.competitor.count.mockResolvedValue(0);
  mocks.prisma.competitor.findFirst.mockResolvedValue(competitor());
  mocks.prisma.competitor.findUnique.mockResolvedValue(null);
  mocks.prisma.competitor.update.mockResolvedValue(competitor());
  mocks.prisma.project.updateMany.mockResolvedValue({ count: 1 });
  mocks.prisma.$queryRaw.mockResolvedValue([]);
  mocks.prisma.competitorSuggestionDismissal.upsert.mockResolvedValue({});
  mocks.writeAudit.mockResolvedValue({});
});

describe("competitor-set actions", () => {
  it("confirms only a current server-derived suggestion with its exact evidence", async () => {
    const evidence = { bestPosition: 2, domain: "competitor.example.com", of: 9, seenOn: 4 };
    mocks.getCompetitorSuggestions.mockResolvedValue([evidence]);
    mocks.prisma.competitor.create.mockResolvedValue(competitor({ evidence, source: "suggested" }));

    const result = await confirmSuggestedCompetitor({
      domain: "competitor.example.com",
      projectId: projectPublicId,
    });

    expect(result).toEqual(
      expect.objectContaining({ id: competitorPublicId, evidence, source: "suggested" }),
    );
    expect(JSON.stringify(result)).not.toContain("competitor_1");

    expect(mocks.getCompetitorSuggestions).toHaveBeenCalledWith("project_1", mocks.prisma);
    expect(mocks.prisma.competitor.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          domain: evidence.domain,
          evidence,
          projectId: "project_1",
          source: "suggested",
        }),
      }),
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "competitor.suggestion.confirm",
        targetType: "competitor",
      }),
      mocks.prisma,
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "competitor.setup.confirm",
        targetId: projectPublicId,
        targetType: "project",
      }),
      mocks.prisma,
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(appPath("[project]", "competitors"), "page");
  });

  it("persists the confirmed setup outcome for a project with no prior decision", async () => {
    const setup = freshProjectSetup();
    mocks.getCompetitorSuggestions.mockResolvedValue([
      { bestPosition: 2, domain: "competitor.example.com", of: 9, seenOn: 4 },
    ]);

    await confirmSuggestedCompetitor({
      domain: "competitor.example.com",
      projectId: projectPublicId,
    });

    expect(setup.outcome()).toBe("confirmed");
    expect(setup.decidedAt()).toBeInstanceOf(Date);
  });

  it("rejects forged or stale suggestion domains without a write or audit", async () => {
    mocks.getCompetitorSuggestions.mockResolvedValue([
      { bestPosition: 2, domain: "other.example.com", of: 9, seenOn: 4 },
    ]);

    await expect(
      confirmSuggestedCompetitor({ domain: "competitor.example.com", projectId: projectPublicId }),
    ).rejects.toThrow("not currently suggested");

    expect(mocks.prisma.competitor.create).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("rejects a non-normalized confirmation identifier before reading suggestions", async () => {
    await expect(
      confirmSuggestedCompetitor({
        domain: "https://competitor.example.com/path",
        projectId: projectPublicId,
      }),
    ).rejects.toThrow("normalized bare domain");

    expect(mocks.getCompetitorSuggestions).not.toHaveBeenCalled();
    expect(mocks.prisma.competitor.create).not.toHaveBeenCalled();
  });

  it("adds normalized manual competitors with trimmed aliases and no evidence", async () => {
    await addManualCompetitor({
      aliases: [" Primary ", "Secondary"],
      domain: "https://competitor.example.com/path",
      projectId: projectPublicId,
    });

    expect(mocks.prisma.competitor.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          aliases: ["Primary", "Secondary"],
          domain: "competitor.example.com",
          evidence: Prisma.DbNull,
          source: "manual",
        }),
      }),
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "competitor.manual.add", targetType: "competitor" }),
      mocks.prisma,
    );
  });

  it("confirms setup after manually adding an active competitor", async () => {
    const setup = freshProjectSetup();

    await addManualCompetitor({
      aliases: [],
      domain: "competitor.example.com",
      projectId: projectPublicId,
    });

    expect(setup.outcome()).toBe("confirmed");
    expect(setup.decidedAt()).toBeInstanceOf(Date);
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "competitor.setup.confirm", targetType: "project" }),
      mocks.prisma,
    );
  });

  it("rejects empty and case-insensitively duplicate aliases before a write", async () => {
    await expect(
      addManualCompetitor({
        aliases: [""],
        domain: "competitor.example.com",
        projectId: projectPublicId,
      }),
    ).rejects.toThrow();
    await expect(
      addManualCompetitor({
        aliases: ["Primary", "primary"],
        domain: "competitor.example.com",
        projectId: projectPublicId,
      }),
    ).rejects.toThrow();

    expect(mocks.prisma.competitor.create).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("allows an empty alias array and updates aliases for a retained competitor", async () => {
    await addManualCompetitor({
      aliases: [],
      domain: "competitor.example.com",
      projectId: projectPublicId,
    });
    await updateCompetitorAliases({
      aliases: ["Primary"],
      competitorId: competitorPublicId,
      projectId: projectPublicId,
    });

    expect(mocks.prisma.competitor.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ aliases: [] }) }),
    );
    expect(mocks.prisma.competitor.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { aliases: ["Primary"] } }),
    );
  });

  it("persists dismissal and setup skip idempotently with separate project audits", async () => {
    await dismissCompetitorSuggestion({
      domain: "competitor.example.com",
      projectId: projectPublicId,
    });
    await dismissCompetitorSuggestion({
      domain: "competitor.example.com",
      projectId: projectPublicId,
    });
    await skipCompetitorSetup({ projectId: projectPublicId });
    await skipCompetitorSetup({ projectId: projectPublicId });

    expect(mocks.prisma.competitorSuggestionDismissal.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId_domain: { domain: "competitor.example.com", projectId: "project_1" } },
      }),
    );
    expect(mocks.prisma.competitorSuggestionDismissal.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.competitor.create).not.toHaveBeenCalled();
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "competitor.suggestion.dismiss", targetType: "project" }),
      mocks.prisma,
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "competitor.setup.skip", targetType: "project" }),
      mocks.prisma,
    );
  });

  it("persists the skipped setup outcome for a project with no prior decision", async () => {
    const setup = freshProjectSetup();

    await skipCompetitorSetup({ projectId: projectPublicId });

    expect(setup.outcome()).toBe("skipped");
    expect(setup.decidedAt()).toBeInstanceOf(Date);
  });

  it("resolves skip as confirmed when the server finds active competitors", async () => {
    const setup = freshProjectSetup();
    mocks.prisma.competitor.count.mockResolvedValue(1);

    await expect(skipCompetitorSetup({ projectId: projectPublicId })).resolves.toEqual({
      outcome: "confirmed",
    });

    expect(mocks.prisma.competitor.count).toHaveBeenCalledWith({
      where: { projectId: "project_1" },
    });
    expect(setup.outcome()).toBe("confirmed");
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "competitor.setup.confirm", targetType: "project" }),
      mocks.prisma,
    );
  });

  it("keeps a concurrent manual add confirmed instead of overwriting it with skipped", async () => {
    let activeCompetitorCount = 0;
    let projectLocked = false;
    let setupOutcome: SetupOutcome | null = null;
    let releaseProjectLock!: () => void;
    let releaseSkipCount!: () => void;
    let signalManualAdd!: () => void;
    let signalSkipCount!: () => void;
    const projectLockReleased = new Promise<void>((resolve) => {
      releaseProjectLock = resolve;
    });
    const skipCountReleased = new Promise<void>((resolve) => {
      releaseSkipCount = resolve;
    });
    const manualAddStarted = new Promise<void>((resolve) => {
      signalManualAdd = resolve;
    });
    const skipCountRead = new Promise<void>((resolve) => {
      signalSkipCount = resolve;
    });
    const project = {
      updateMany: vi.fn(({ data }: SetupOutcomeUpdate) => {
        setupOutcome = data.competitorSetupOutcome;
        return Promise.resolve({ count: 1 });
      }),
    };
    const skipTransaction = {
      $queryRaw: vi.fn(async () => {
        projectLocked = true;
        return [];
      }),
      competitor: {
        count: vi.fn(async () => {
          const observedCount = activeCompetitorCount;
          signalSkipCount();
          await skipCountReleased;
          return observedCount;
        }),
      },
      project,
    };
    const addTransaction = {
      competitor: {
        create: vi.fn(async () => {
          signalManualAdd();
          if (projectLocked) await projectLockReleased;
          activeCompetitorCount += 1;
          return competitor();
        }),
      },
      project,
    };
    let transactionCount = 0;
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (transaction: unknown) => Promise<unknown>) => {
        const transaction = transactionCount === 0 ? skipTransaction : addTransaction;
        transactionCount += 1;
        const result = await callback(transaction);
        if (transaction === skipTransaction && projectLocked) releaseProjectLock();
        return result;
      },
    );

    const skip = skipCompetitorSetup({ projectId: projectPublicId });
    await skipCountRead;
    const add = addManualCompetitor({
      aliases: [],
      domain: "manual.example.org",
      projectId: projectPublicId,
    });
    await manualAddStarted;
    releaseSkipCount();

    await Promise.all([skip, add]);

    expect(setupOutcome).toBe("confirmed");
    expect(skipTransaction.$queryRaw).toHaveBeenCalledOnce();
  });

  it("keeps a concurrent legacy add confirmed when skip locks first", async () => {
    let activeCompetitorCount = 0;
    let projectLocked = false;
    let setupOutcome: SetupOutcome | null = null;
    const projectLockReleased = deferred();
    const skipCountReleased = deferred();
    const legacyAddStarted = deferred();
    const skipCountRead = deferred();
    const project = {
      updateMany: vi.fn(({ data }: SetupOutcomeUpdate) => {
        setupOutcome = data.competitorSetupOutcome;
        return Promise.resolve({ count: 1 });
      }),
    };
    const skipTransaction = {
      $queryRaw: vi.fn(async () => {
        projectLocked = true;
        return [];
      }),
      competitor: {
        count: vi.fn(async () => {
          const observedCount = activeCompetitorCount;
          skipCountRead.resolve();
          await skipCountReleased.promise;
          return observedCount;
        }),
      },
      project,
    };
    const legacyAddTransaction = {
      $queryRaw: vi.fn(async () => {
        legacyAddStarted.resolve();
        if (projectLocked) await projectLockReleased.promise;
        return [];
      }),
      competitor: {
        create: vi.fn(async () => {
          activeCompetitorCount += 1;
          return competitor();
        }),
        findUnique: vi.fn(async () => {
          legacyAddStarted.resolve();
          return null;
        }),
      },
      project,
    };
    mocks.prisma.competitor.findUnique.mockResolvedValue(null);
    mocks.prisma.competitor.create.mockImplementation(async () => {
      legacyAddStarted.resolve();
      if (projectLocked) await projectLockReleased.promise;
      activeCompetitorCount += 1;
      return competitor();
    });
    let transactionCount = 0;
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (transaction: unknown) => Promise<unknown>) => {
        const transaction = transactionCount === 0 ? skipTransaction : legacyAddTransaction;
        transactionCount += 1;
        const result = await callback(transaction);
        if (transaction === skipTransaction && projectLocked) {
          projectLocked = false;
          projectLockReleased.resolve();
        }
        return result;
      },
    );

    const skip = skipCompetitorSetup({ projectId: projectPublicId });
    await skipCountRead.promise;
    const add = addManagedCompetitor({
      domain: "legacy.example.org",
      projectId: projectPublicId,
    });
    await legacyAddStarted.promise;
    skipCountReleased.resolve();

    await Promise.all([skip, add]);

    expect(setupOutcome).toBe("confirmed");
    expect(legacyAddTransaction.$queryRaw).toHaveBeenCalledOnce();
  });

  it("keeps a concurrent legacy add confirmed when it locks before skip", async () => {
    let activeCompetitorCount = 0;
    let projectLocked = false;
    let setupOutcome: SetupOutcome | null = null;
    const projectLockReleased = deferred();
    const addLookupReleased = deferred();
    const legacyAddStarted = deferred();
    const skipLockAttempted = deferred();
    const project = {
      updateMany: vi.fn(({ data }: SetupOutcomeUpdate) => {
        setupOutcome = data.competitorSetupOutcome;
        return Promise.resolve({ count: 1 });
      }),
    };
    const legacyAddTransaction = {
      $queryRaw: vi.fn(async () => {
        projectLocked = true;
        return [];
      }),
      competitor: {
        create: vi.fn(async () => {
          activeCompetitorCount += 1;
          return competitor();
        }),
        findUnique: vi.fn(async () => {
          legacyAddStarted.resolve();
          await addLookupReleased.promise;
          return null;
        }),
      },
      project,
    };
    const skipTransaction = {
      $queryRaw: vi.fn(async () => {
        skipLockAttempted.resolve();
        if (projectLocked) await projectLockReleased.promise;
        projectLocked = true;
        return [];
      }),
      competitor: { count: vi.fn(async () => activeCompetitorCount) },
      project,
    };
    mocks.prisma.competitor.findUnique.mockImplementation(async () => {
      legacyAddStarted.resolve();
      await addLookupReleased.promise;
      return null;
    });
    mocks.prisma.competitor.create.mockImplementation(async () => {
      if (projectLocked) await projectLockReleased.promise;
      activeCompetitorCount += 1;
      return competitor();
    });
    let addUsedTransaction = false;
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (transaction: unknown) => Promise<unknown>) => {
        const transaction = addUsedTransaction ? skipTransaction : legacyAddTransaction;
        addUsedTransaction = true;
        const result = await callback(transaction);
        if (projectLocked) {
          projectLocked = false;
          projectLockReleased.resolve();
        }
        return result;
      },
    );

    const add = addManagedCompetitor({
      domain: "legacy.example.org",
      projectId: projectPublicId,
    });
    await legacyAddStarted.promise;
    const legacyAddHeldProjectLock = projectLocked;
    if (!addUsedTransaction) addUsedTransaction = true;
    const skip = skipCompetitorSetup({ projectId: projectPublicId });
    await skipLockAttempted.promise;
    addLookupReleased.resolve();

    await Promise.all([add, skip]);

    expect(legacyAddHeldProjectLock).toBe(true);
    expect(setupOutcome).toBe("confirmed");
    expect(legacyAddTransaction.$queryRaw).toHaveBeenCalledOnce();
  });

  it("rejects viewer and unauthenticated mutations without writes", async () => {
    actor("viewer");
    await expect(skipCompetitorSetup({ projectId: projectPublicId })).rejects.toBeInstanceOf(
      mocks.AuthorizationError,
    );
    mocks.requireSession.mockRejectedValue(new Error("Authentication is required."));
    await expect(skipCompetitorSetup({ projectId: projectPublicId })).rejects.toThrow(
      "Authentication is required.",
    );

    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });
});
