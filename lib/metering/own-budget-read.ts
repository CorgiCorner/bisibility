import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { OwnBudgetRead, OwnBudgetReadInput } from "@/lib/metering/own-budget-read-types";
import type { OwnBudgetReader } from "@/lib/metering/own-budget-read-types";

export const readOwnConnectionBudgets: OwnBudgetReader = async () => null;
export type {
  OwnBudgetRead,
  OwnBudgetReader,
  OwnBudgetReadInput,
} from "@/lib/metering/own-budget-read-types";

export const readOwnConnectionBudgetSnapshot = async (
  _tx: Prisma.TransactionClient,
  _input: OwnBudgetReadInput,
): Promise<OwnBudgetRead | null> => null;
