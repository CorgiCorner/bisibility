import { beforeEach, describe, expect, it, vi } from "vitest";
import { formFromStored } from "./form-state";
import type { CostItemInput } from "./input";
import { toCostItemInput } from "./input";
import { projectMonthlyMinor } from "./monthly";

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  update: vi.fn(),
  share: vi.fn(),
  audit: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { costItem: { findFirst: mocks.find }, $transaction: mocks.transaction },
}));
vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (id: string) => id,
  writeAudit: mocks.audit,
}));

import { replaceCostItem } from "./persist";

const scope = { id: "a", ownerId: "owner", publicId: "prj_a" };
const linked = [scope];
function fixture(split: "equal" | "percent" = "percent") {
  return {
    id: "cost",
    publicId: "cst_example",
    ownerId: "owner",
    amountMinor: 999,
    billing: "monthly" as const,
    currency: "USD",
    kind: "custom" as const,
    name: "Shared tool",
    planLabel: "Old plan",
    catalogKey: null,
    startedOn: new Date("2026-01-01"),
    endedOn: null,
    split,
    priceChanges: [],
    projects: [
      {
        id: "link-a",
        projectId: "a",
        basisPoints: split === "equal" ? null : 2500,
        project: { publicId: "prj_a" },
      },
      {
        id: "link-b",
        projectId: "b",
        basisPoints: split === "equal" ? null : 7500,
        project: { publicId: "prj_b" },
      },
    ],
  };
}
let stored = fixture();
function total(projectId: string) {
  return projectMonthlyMinor(
    { ...stored, startedOn: "2026-01-01", endedOn: null },
    projectId,
    "2026-11",
  );
}
function input(): CostItemInput {
  const values = formFromStored(
    {
      ...stored,
      startedOn: "2026-01-01",
      projects: stored.projects.map((p) => ({
        id: p.projectId,
        publicId: p.project.publicId,
        basisPoints: p.basisPoints,
      })),
    },
    "prj_a",
  );
  const result = toCostItemInput({ ...values, planLabel: "New plan" }, "prj_a", stored.publicId);
  if (typeof result === "string") throw new Error(result);
  return result;
}
beforeEach(() => {
  stored = fixture();
  vi.clearAllMocks();
  mocks.find.mockImplementation(async () => structuredClone(stored));
  mocks.transaction.mockImplementation(async (work) =>
    work({
      costItem: { findFirst: mocks.find, update: mocks.update },
      costItemProject: { updateMany: mocks.share },
    }),
  );
  mocks.share.mockImplementation(async ({ data, where }) => {
    for (const project of stored.projects)
      if (project.projectId === where.projectId && project.basisPoints === null)
        Object.assign(project, data);
  });
  mocks.update.mockImplementation(async ({ data }) => {
    const { projects, priceChanges, ...fields } = data;
    Object.assign(stored, fields);
    if (projects.deleteMany)
      stored.projects = stored.projects.filter((p) =>
        Object.entries(projects.deleteMany).some(
          ([key, value]) => p[key as keyof typeof p] !== value,
        ),
      );
    if (projects.upsert) {
      const mine = stored.projects.find(
        (p) => p.projectId === projects.upsert.where.costItemId_projectId.projectId,
      );
      if (mine) Object.assign(mine, projects.upsert.update);
    }
  });
});

describe("project-scoped cost updates", () => {
  it("preserves B's entire row and monthly total when A edits the shared plan label", async () => {
    const beforeRow = structuredClone(stored.projects[1]);
    const before = total("b");
    expect(before).toBe(749);
    await replaceCostItem("actor", scope, linked, input());
    expect(stored.planLabel).toBe("New plan");
    expect(stored.projects[1]).toEqual(beforeRow);
    expect(total("b")).toBe(749);
    expect(total("b")).toBe(before);
    expect(mocks.share).not.toHaveBeenCalled();
  });
  it("removes only A's row when its share becomes zero", async () => {
    const update = input();
    update.projects[0].basisPoints = 0;
    await replaceCostItem("actor", scope, linked, update);
    expect(stored.projects.map((p) => p.projectId)).toEqual(["b"]);
    expect(total("b")).toBe(749);
    expect(mocks.update.mock.calls[0][0].data.projects.deleteMany).toEqual({ projectId: "a" });
  });
  it("converts equal shares once without changing either project's monthly total", async () => {
    stored = fixture("equal");
    const before = [total("a"), total("b")];
    expect(before).toEqual([500, 499]);
    await replaceCostItem("actor", scope, linked, input());
    expect(stored.split).toBe("percent");
    expect(stored.projects.map((p) => p.basisPoints)).toEqual([5005, 4995]);
    expect([total("a"), total("b")]).toEqual([500, 499]);
    await replaceCostItem("actor", scope, linked, input());
    expect(mocks.share).toHaveBeenCalledTimes(2);
    expect([total("a"), total("b")]).toEqual(before);
  });
  it("still applies shared price edits to every project", async () => {
    const update = { ...input(), amountMinor: 2000 };
    await replaceCostItem("actor", scope, linked, update);
    expect(total("a")).toBe(500);
    expect(total("b")).toBe(1500);
  });
});

it("retains an equal allocation when integer basis points cannot preserve every cent", async () => {
  stored = fixture("equal");
  stored.amountMinor = 15000;
  stored.projects.push({
    id: "link-c",
    projectId: "c",
    basisPoints: null,
    project: { publicId: "prj_c" },
  });
  expect([total("a"), total("b"), total("c")]).toEqual([5000, 5000, 5000]);
  await replaceCostItem("actor", scope, linked, input());
  expect(stored.planLabel).toBe("New plan");
  expect(stored.split).toBe("equal");
  expect(stored.projects.map((p) => p.basisPoints)).toEqual([null, null, null]);
  expect([total("a"), total("b"), total("c")]).toEqual([5000, 5000, 5000]);
});
it("blocks a share edit that would move another project's rounding cent", async () => {
  stored.projects[0].basisPoints = 5000;
  stored.projects[1].basisPoints = 5000;
  const before = structuredClone(stored);
  expect(total("b")).toBe(499);
  const edit = input();
  edit.projects[0].basisPoints = 0;
  await expect(replaceCostItem("actor", scope, linked, edit)).rejects.toMatchObject({
    code: "share_precision",
  });
  expect(stored).toEqual(before);
  expect(total("b")).toBe(499);
  expect(mocks.update).not.toHaveBeenCalled();
});
