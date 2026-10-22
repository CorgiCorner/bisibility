import type { Prisma as PrismaTypes } from "@/lib/generated/prisma/client";
import { Prisma } from "@/lib/generated/prisma/client";
import { ensureProjectSpendingBudget } from "@/lib/metering/project-budget-bootstrap";
import { projectBudgetCapCents } from "@/lib/metering/project-budget-read";
import { setProjectSpendingLimit } from "@/lib/metering/project-spending-limit";
import { adoptedTimestampQuery, usageReadFixture } from "@/lib/metering/read.test-fixture";
import { getUpcomingView } from "@/lib/queries/upcoming-view";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    $queryRawUnsafe: vi.fn(),
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    keyword: { findMany: vi.fn(async () => []) },
    project: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
    providerConnection: { findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (id: string) => id,
  writeAudit: vi.fn(),
}));
vi.mock("@/lib/queries/_auth", () => ({
  requireReadableProject: async () => ({ project: { id: "project_1", writeMode: "active" } }),
}));
vi.mock("@/lib/queries/workspace-request-data", () => ({
  getRequestProjectDefaults: async () => null,
  getRequestSerpProviderChain: async () => [{ provider: "dataforseo" }],
  getRequestPrimarySerpProvider: async () => ({ provider: "dataforseo", credentialSource: "own" }),
  getRequestMonthlySpendCents: async () => 0,
}));

import { preflightProviderBudget } from "./paid-call-budget";

let store: Awaited<ReturnType<typeof usageReadFixture>>;
const publicId = "prj_abcdefghijklmnopqrstuvwx";
const actor = { id: "owner", memberships: [{ projectId: "project_1", role: "owner" as const }] };
const request = { projectId: "project_1", surface: "app" as const, estimatedCostCents: 5 };
beforeEach(async () => {
  vi.clearAllMocks();
  mocks.prisma.$queryRawUnsafe.mockImplementation(adoptedTimestampQuery);
  store = await usageReadFixture();
  await store.db.exec(`ALTER TABLE metering_budget ADD COLUMN scope_kind text,
    ADD COLUMN unit text, ADD COLUMN limit_value numeric, ADD COLUMN limit_scale int,
    ADD COLUMN "window" jsonb, ADD COLUMN on_exceed text;
    CREATE TABLE projects(id text); INSERT INTO projects VALUES('project_1');`);
  mocks.prisma.$queryRaw.mockImplementation((query, ...values) =>
    store.query(Array.isArray(query) ? Prisma.sql(query, ...values) : query),
  );
  mocks.prisma.$executeRaw.mockImplementation(async (query) => {
    await store.db.query(query.text, query.values);
    return 1;
  });
  const project = {
    id: "project_1",
    publicId,
    ownerId: "owner",
    isSample: false,
    writeMode: "active",
    budgetCapCents: 100,
  };
  mocks.prisma.project.findUnique.mockResolvedValue(project);
  mocks.prisma.project.findUniqueOrThrow.mockResolvedValue(project);
  mocks.prisma.providerConnection.findFirst.mockResolvedValue({ credentialSource: "own" });
});
afterEach(async () => store.db.close());
const setCap = (capCents: number) =>
  setProjectSpendingLimit(mocks.prisma as unknown as PrismaTypes.TransactionClient, {
    actor,
    projectPublicId: publicId,
    capCents,
  });

it.each(["connected", "connectionless"])(
  "settings cap overrides stale column for %s paid calls",
  async (kind) => {
    const input =
      kind === "connectionless"
        ? request
        : { ...request, connectionId: "connection", provider: "dataforseo" };
    await setCap(2);
    await expect(preflightProviderBudget(input)).rejects.toMatchObject({
      outcome: { reason: "budget_exhausted" },
    });
    mocks.prisma.project.findUnique.mockResolvedValue({
      id: "project_1",
      ownerId: "owner",
      budgetCapCents: 1,
    });
    await setCap(10);
    await expect(preflightProviderBudget(input)).resolves.toBeUndefined();
  },
);

it("upcoming checks reread the Store after each settings change", async () => {
  await setCap(777);
  expect((await getUpcomingView("project_1")).forecast?.capCents).toBe(777);
  await setCap(222);
  expect((await getUpcomingView("project_1")).forecast?.capCents).toBe(222);
});
it("bootstraps a new project at 5000 and never replaces settings changes", async () => {
  const tx = mocks.prisma as unknown as PrismaTypes.TransactionClient;
  await ensureProjectSpendingBudget(tx, "default", "project_1");
  expect(await projectBudgetCapCents("project_1")).toBe(5000);
  await setCap(77);
  await ensureProjectSpendingBudget(tx, "default", "project_1");
  expect(await projectBudgetCapCents("project_1")).toBe(77);
});
// This covers shared preflight; the hosted adapter's binding tests cover hosted admission.
it.each(["connected", "connectionless"])(
  "denies %s preflight when the project Store budget is missing",
  async (kind) => {
    const input =
      kind === "connectionless"
        ? request
        : { ...request, connectionId: "connection", provider: "dataforseo" };
    await expect(preflightProviderBudget(input)).rejects.toMatchObject({
      outcome: { reason: "budget_exhausted", budgetReason: "budget_missing" },
    });
  },
);
