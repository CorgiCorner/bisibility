import "server-only";

import { Prisma } from "@/lib/generated/prisma/client";
import { projectBudgetCapCents } from "@/lib/rank-check/budget";
import { getRequestMonthlySpendCents } from "./workspace-request-data";

export type WorkspaceBudgetSummary = {
  capCents: number;
  spentCents: number;
};

// Only Prisma 7 connectivity and pool errors may hide the spend widget;
// programming and authorization failures must remain visible.
const CONNECTION_ERROR_CODES = new Set(["P2024", "P1001", "P1002", "P1008", "P1017"]);

function connectionErrorCode(error: unknown): string | null {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    CONNECTION_ERROR_CODES.has(error.code)
  ) {
    return error.code;
  }
  if (
    error instanceof Prisma.PrismaClientInitializationError &&
    error.errorCode &&
    CONNECTION_ERROR_CODES.has(error.errorCode)
  ) {
    return error.errorCode;
  }
  return null;
}

export async function loadWorkspaceBudgetSummary(
  projectId: string,
  now = new Date(),
): Promise<WorkspaceBudgetSummary | null> {
  try {
    const spentCents = await getRequestMonthlySpendCents(projectId, now);
    const capCents = await projectBudgetCapCents(projectId);
    return { capCents, spentCents };
  } catch (error) {
    const code = connectionErrorCode(error);
    if (code) {
      console.warn(
        `loadWorkspaceBudgetSummary: database connectivity error ${code}; returning null`,
      );
      return null;
    }
    console.warn("loadWorkspaceBudgetSummary: unexpected error; rethrowing");
    throw error;
  }
}
