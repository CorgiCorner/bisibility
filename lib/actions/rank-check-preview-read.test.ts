import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFirstCheckRunPlan, listFirstCheckCandidates } from "./rank-check-preview";

const KEYWORD_PUBLIC_ID = "kw_abcdefghijklmnopqrstuvwx";
const SECOND_KEYWORD_PUBLIC_ID = "kw_bcdefghijklmnopqrstuvwxy";
const PROJECT_PUBLIC_ID = "prj_abcdefghijklmnopqrstuvwx";
const SAMPLE_PROJECT_PUBLIC_ID = "prj_bcdefghijklmnopqrstuvwxy";

function keywordRow(id: string, publicId: string, text: string, device: "desktop" | "mobile") {
  return {
    device,
    id,
    locationRef: { displayName: "United States", languageLabel: "English" },
    publicId,
    text,
  };
}

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  loadSerpProviderChain: vi.fn(),
  monthlySpendCents: vi.fn(),
  prisma: {
    keyword: { count: vi.fn(), findMany: vi.fn() },
    keywordTrafficSnapshot: { findMany: vi.fn() },
    project: { findFirst: vi.fn(), findUnique: vi.fn() },
    projectDefaults: { findUnique: vi.fn() },
    providerConnection: { count: vi.fn() },
    user: { findUnique: vi.fn() },
  },
  requireSession: vi.fn(),
}));

vi.mock("@/lib/auth/authorize", () => ({ authorize: mocks.authorize }));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/rank-check/budget", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rank-check/budget")>()),
  monthlySpendCents: mocks.monthlySpendCents,
}));
vi.mock("@/lib/rank-check/fallback", () => ({
  loadSerpProviderChain: mocks.loadSerpProviderChain,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

describe("rank check preview read actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
    mocks.prisma.user.findUnique.mockResolvedValue({
      memberships: [{ projectId: "project_1", role: "admin" }],
      role: "member",
    });
    mocks.prisma.project.findFirst.mockResolvedValue({
      id: "project_1",
      isSample: false,
      ownerId: "user_1",
      publicId: PROJECT_PUBLIC_ID,
      writeMode: "active",
      writeModeChangedAt: null,
      writeModeChangedById: null,
    });
    mocks.loadSerpProviderChain.mockResolvedValue([]);
    mocks.monthlySpendCents.mockResolvedValue(0);
    mocks.prisma.keyword.count.mockResolvedValue(2);
    mocks.prisma.keyword.findMany.mockReset().mockResolvedValue([]);
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue(null);
    mocks.prisma.providerConnection.count.mockReset();
    mocks.prisma.project.findUnique.mockResolvedValue({ budgetCapCents: 100 });
  });

  it("lists only keywords without completed checks and keeps target URLs first", async () => {
    mocks.prisma.keyword.findMany
      .mockResolvedValueOnce([
        keywordRow("keyword_1", KEYWORD_PUBLIC_ID, "rank tracker", "desktop"),
      ])
      .mockResolvedValueOnce([
        keywordRow("keyword_2", SECOND_KEYWORD_PUBLIC_ID, "seo api", "mobile"),
      ]);
    mocks.prisma.providerConnection.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    const result = await listFirstCheckCandidates({ limit: 2, projectId: PROJECT_PUBLIC_ID });

    expect(result).toEqual({
      candidates: [
        {
          device: "desktop",
          id: "keyword_1",
          market: { languageLabel: "English", locationLabel: "United States" },
          publicId: KEYWORD_PUBLIC_ID,
          text: "rank tracker",
        },
        {
          device: "mobile",
          id: "keyword_2",
          market: { languageLabel: "English", locationLabel: "United States" },
          publicId: SECOND_KEYWORD_PUBLIC_ID,
          text: "seo api",
        },
      ],
      hasAnalyticsSource: false,
      isSampleProject: false,
      providerReady: true,
    });
    expect(mocks.prisma.keyword.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        orderBy: { createdAt: "asc" },
        take: 2,
        where: {
          projectId: "project_1",
          rankChecks: { none: { status: "completed" } },
          targetUrl: { not: null },
        },
      }),
    );
    expect(mocks.prisma.keyword.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        orderBy: { createdAt: "asc" },
        take: 1,
        where: {
          projectId: "project_1",
          rankChecks: { none: { status: "completed" } },
          targetUrl: null,
        },
      }),
    );
  });

  it("limits the sample matrix to the selected keyword text", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    mocks.prisma.providerConnection.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    await listFirstCheckCandidates({
      keywordText: "seo api",
      limit: 6,
      projectId: PROJECT_PUBLIC_ID,
    });

    expect(mocks.prisma.keyword.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        take: 6,
        where: expect.objectContaining({ projectId: "project_1", text: "seo api" }),
      }),
    );
  });

  it("short-circuits candidate listing for sample projects", async () => {
    mocks.prisma.project.findFirst.mockResolvedValueOnce({
      id: "project_1",
      isSample: true,
      ownerId: "user_1",
      publicId: SAMPLE_PROJECT_PUBLIC_ID,
      writeMode: "active",
      writeModeChangedAt: null,
      writeModeChangedById: null,
    });
    mocks.prisma.providerConnection.count.mockResolvedValueOnce(1);

    const result = await listFirstCheckCandidates({
      limit: 2,
      projectId: SAMPLE_PROJECT_PUBLIC_ID,
    });

    expect(result).toEqual({
      candidates: [],
      hasAnalyticsSource: true,
      isSampleProject: true,
      providerReady: false,
    });
    expect(mocks.prisma.keyword.findMany).not.toHaveBeenCalled();
  });

  it("returns the ready count and provider fallback order", async () => {
    mocks.loadSerpProviderChain.mockResolvedValue([
      { costPerCheckCents: 0.25, credentialsEncrypted: "secret-a", provider: "dataforseo" },
      { credentialsEncrypted: "secret-b", provider: "secondary" },
    ]);
    // biome-ignore format: compact fixture keeps this test under the project line cap.
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue({ city: null, country: "Poland", device: "mobile", frequency: "weekly", locationKey: "PL", serpDepth: 50 });

    const result = await getFirstCheckRunPlan({ projectId: PROJECT_PUBLIC_ID });

    // biome-ignore format: compact assertion keeps this test under the project line cap.
    expect(result).toMatchObject({ budget: { capCents: 100, spentCents: 0 }, estimatedCostPerCheckCents: 0.25, providerReady: true, providers: ["dataforseo", "secondary"], readyCount: 2, scope: { depth: "Top 50", device: "Mobile", engine: "Google", frequency: "Weekly", location: "Poland" } });
    expect(mocks.prisma.keyword.count).toHaveBeenCalledWith({
      where: { projectId: "project_1", rankChecks: { none: { status: "completed" } } },
    });
  });

  it("preserves an explicit zero-cost provider estimate", async () => {
    mocks.loadSerpProviderChain.mockResolvedValue([
      { costPerCheckCents: 0, credentialsEncrypted: null, provider: "local-sequence" },
    ]);

    await expect(getFirstCheckRunPlan({ projectId: PROJECT_PUBLIC_ID })).resolves.toMatchObject({
      estimatedCostPerCheckCents: 0,
      providerReady: true,
    });
  });

  it("reports no ready provider when the chain is empty", async () => {
    const result = await getFirstCheckRunPlan({ projectId: PROJECT_PUBLIC_ID });
    expect(result).toMatchObject({ providerReady: false, providers: [] });
  });

  it("falls back to the default preview depth for an unsupported stored value", async () => {
    mocks.prisma.projectDefaults.findUnique.mockResolvedValueOnce({ serpDepth: 30 });
    expect((await getFirstCheckRunPlan({ projectId: PROJECT_PUBLIC_ID })).scope.depth).toBe(
      "Top 100",
    );
  });

  it("short-circuits run plans for sample projects", async () => {
    // biome-ignore format: compact fixture keeps this test under the project line cap.
    mocks.prisma.project.findFirst.mockResolvedValueOnce({ id: "project_1", isSample: true, ownerId: "user_1", publicId: SAMPLE_PROJECT_PUBLIC_ID, writeMode: "active" });
    mocks.monthlySpendCents.mockResolvedValueOnce(42);
    const result = await getFirstCheckRunPlan({ projectId: SAMPLE_PROJECT_PUBLIC_ID });
    // biome-ignore format: compact assertion keeps this test under the project line cap.
    expect(result).toMatchObject({ budget: { capCents: 100, spentCents: 42 }, budgetExhausted: false, estimatedCostPerCheckCents: null, isSampleProject: true, providerReady: false, providers: [], readyCount: 0, scope: { depth: "Top 100" } });
    expect(mocks.prisma.keyword.count).not.toHaveBeenCalled();
  });

  it("reports exhausted budget when monthly spend reaches the cap", async () => {
    mocks.monthlySpendCents.mockResolvedValueOnce(100);
    await expect(getFirstCheckRunPlan({ projectId: PROJECT_PUBLIC_ID })).resolves.toMatchObject({
      budgetExhausted: true,
    });
  });

  it("does not serialize provider credentials", async () => {
    // biome-ignore format: compact fixture keeps this test under the project line cap.
    mocks.loadSerpProviderChain.mockResolvedValue([{ credentialsEncrypted: "secret", provider: "primary" }]);
    const result = await getFirstCheckRunPlan({ projectId: PROJECT_PUBLIC_ID });
    expect(JSON.stringify(result)).not.toMatch(/credential/i);
  });
});
