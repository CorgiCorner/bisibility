import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { meteringNamespace } from "./runtime";
import { putSpendingBudget, readSpendingBudgets } from "./spending-limit-store";
import { fundingSpendingBudgets, projectSpendingBudget } from "./spending-limits";

type OldInput = {
  allocationAmountPerMonth?: unknown;
  programmaticAllocationAmountPerMonth?: unknown;
  allocationUnit?: unknown;
  creditsAllocationAmountPerMonth?: unknown;
  creditsProgrammaticAllocationAmountPerMonth?: unknown;
};
const amount = (value: unknown) => (value == null ? null : String(value));
export async function setFixtureBudgets(db: PrismaClient, id: string, values: OldInput) {
  const connection = await db.providerConnection.findUniqueOrThrow({ where: { id } });
  await db.$transaction(async (tx) => {
    for (const funding of ["byok", "platform"] as const) {
      const app =
        funding === "byok"
          ? values.allocationAmountPerMonth
          : values.creditsAllocationAmountPerMonth;
      const programmatic =
        funding === "byok"
          ? values.programmaticAllocationAmountPerMonth
          : values.creditsProgrammaticAllocationAmountPerMonth;
      if (app === undefined && programmatic === undefined) continue;
      for (const budget of fundingSpendingBudgets(
        meteringNamespace(),
        {
          id,
          provider: connection.provider,
          unit: values.allocationUnit === "units" ? "units" : "cents",
          app: amount(app),
          programmatic: amount(programmatic),
        },
        funding,
        1,
      )) {
        const current = (await readSpendingBudgets(tx, meteringNamespace(), [budget.scope])).find(
          (b) => b.id === budget.id,
        );
        if ((budget.surface === "app" ? app : programmatic) === undefined && current) continue;
        await putSpendingBudget(tx, { ...budget, version: (current?.version ?? 0) + 1 });
      }
    }
  });
}
export async function createBudgetedConnectionFixture(
  db: PrismaClient,
  args: Omit<Prisma.ProviderConnectionCreateArgs, "data"> & {
    data: Prisma.ProviderConnectionCreateArgs["data"] & OldInput;
  },
) {
  const {
    allocationAmountPerMonth,
    programmaticAllocationAmountPerMonth,
    allocationUnit,
    creditsAllocationAmountPerMonth,
    creditsProgrammaticAllocationAmountPerMonth,
    ...data
  } = args.data;
  const connection = await db.providerConnection.create({ ...args, data });
  await setFixtureBudgets(db, connection.id, {
    allocationAmountPerMonth,
    programmaticAllocationAmountPerMonth,
    allocationUnit,
    creditsAllocationAmountPerMonth,
    creditsProgrammaticAllocationAmountPerMonth,
  });
  return connection;
}
export async function updateBudgetedConnectionFixture(
  db: PrismaClient,
  args: Omit<Prisma.ProviderConnectionUpdateArgs, "data"> & {
    data: Prisma.ProviderConnectionUpdateArgs["data"] & OldInput;
  },
) {
  const {
    allocationAmountPerMonth,
    programmaticAllocationAmountPerMonth,
    allocationUnit,
    creditsAllocationAmountPerMonth,
    creditsProgrammaticAllocationAmountPerMonth,
    ...data
  } = args.data;
  const connection = await db.providerConnection.update({ ...args, data });
  await setFixtureBudgets(db, connection.id, {
    allocationAmountPerMonth,
    programmaticAllocationAmountPerMonth,
    allocationUnit,
    creditsAllocationAmountPerMonth,
    creditsProgrammaticAllocationAmountPerMonth,
  });
  return connection;
}
export async function updateBudgetedProjectFixture(
  db: PrismaClient,
  args: Omit<Prisma.ProjectUpdateArgs, "data"> & {
    data: Prisma.ProjectUpdateArgs["data"] & {
      providerAllocationsInitializedAt?: unknown;
      budgetCapCents?: number;
    };
  },
) {
  const { providerAllocationsInitializedAt: _removed, budgetCapCents, ...data } = args.data;
  const project = await db.project.update({ ...args, data });
  await db.$transaction(async (tx) => {
    const budget = projectSpendingBudget(
      meteringNamespace(),
      project.id,
      String(budgetCapCents ?? 5000),
      1,
    );
    const current = (await readSpendingBudgets(tx, meteringNamespace(), [budget.scope])).find(
      (b) => b.id === budget.id,
    );
    if (budgetCapCents !== undefined || !current)
      await putSpendingBudget(tx, { ...budget, version: (current?.version ?? 0) + 1 });
  });
  return project;
}
export async function fixtureBudgetAmount(
  db: PrismaClient,
  id: string,
  funding: "byok" | "platform" = "byok",
  surface = "app",
) {
  const { fundingBudgetId } = await import("./spending-limits");
  const { currentBudgets } = await import("./store/budgets");
  const { createSql } = await import("./store/host-sql");
  const budgets = await currentBudgets(
    createSql(db, { statements: 0, changes: 0n, rowsRead: 0 }),
    meteringNamespace(),
  );
  const budget = budgets.find((b) => b.id === fundingBudgetId(id, funding, surface));
  return budget?.limit ? Number(budget.limit.value) / 10 ** budget.limit.scale : null;
}
export async function readBudgetedConnectionFixture(
  db: PrismaClient,
  args: Prisma.ProviderConnectionFindUniqueOrThrowArgs,
) {
  const row = await db.providerConnection.findUniqueOrThrow(args);
  const [app, programmatic, credits, creditsProgrammatic] = await Promise.all([
    fixtureBudgetAmount(db, row.id, "byok", "app"),
    fixtureBudgetAmount(db, row.id, "byok", "programmatic"),
    fixtureBudgetAmount(db, row.id, "platform", "app"),
    fixtureBudgetAmount(db, row.id, "platform", "programmatic"),
  ]);
  const { providerAllocationMetadata } = await import("@/lib/providers/allocation-metadata");
  const metadata = providerAllocationMetadata(row.provider);
  return {
    ...row,
    allocationAmountPerMonth: app,
    programmaticAllocationAmountPerMonth: programmatic,
    creditsAllocationAmountPerMonth: credits,
    creditsProgrammaticAllocationAmountPerMonth: creditsProgrammatic,
    allocationUnit:
      app === null ? null : metadata?.kind === "billable" ? metadata.allocationUnit : null,
  };
}
