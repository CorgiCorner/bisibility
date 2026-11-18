import "server-only";
import { ModelColumnTransitionError } from "./column-state";
import { isModelStorageBusy } from "./storage-busy";

export interface ModelPlaygroundTransaction {
  $queryRawUnsafe<T>(sql: string, ...args: unknown[]): Promise<T[]>;
}
export interface ModelPlaygroundDatabase {
  $transaction<T>(work: (tx: ModelPlaygroundTransaction) => Promise<T>): Promise<T>;
}

export class ModelPlaygroundStoreError extends Error {
  constructor(
    readonly code: "invalid_snapshot" | "conflict" | "not_found" | "stale_lease" | "storage",
    readonly storageBusy = false,
  ) {
    super(`Model Playground storage: ${code}.`);
  }
}

export async function storeTransaction<T>(
  db: ModelPlaygroundDatabase,
  work: (tx: ModelPlaygroundTransaction) => Promise<T>,
): Promise<T> {
  try {
    return await db.$transaction(work);
  } catch (error) {
    // Database errors may contain the failing row, including retained prompt/answer text.
    if (error instanceof ModelPlaygroundStoreError) throw error;
    if (error instanceof ModelColumnTransitionError)
      throw new ModelPlaygroundStoreError("stale_lease");
    throw new ModelPlaygroundStoreError("storage", isModelStorageBusy(error));
  }
}

export const queryRows = <T>(tx: ModelPlaygroundTransaction, sql: string, ...args: unknown[]) =>
  tx.$queryRawUnsafe<T>(sql, ...args);

export function requireRow<T>(rows: T[], code: "not_found" | "stale_lease" = "not_found"): T {
  if (!rows.length) throw new ModelPlaygroundStoreError(code);
  return rows[0];
}
