import "server-only";
import type { OwnBudgetReader } from "@/lib/metering/own-budget-read-types";

export const readOwnConnectionBudgets: OwnBudgetReader = async () => null;
export type {
  OwnBudgetRead,
  OwnBudgetReader,
  OwnBudgetReadInput,
} from "@/lib/metering/own-budget-read-types";
