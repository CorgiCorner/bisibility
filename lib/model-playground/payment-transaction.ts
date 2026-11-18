import type { Prisma } from "@/lib/generated/prisma/client";
import type { ModelPaymentDatabase } from "./admission-storage";

function serializationFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as {
    code?: string;
    meta?: { code?: string; driverAdapterError?: { cause?: { originalCode?: string } } };
    cause?: unknown;
  };
  return (
    value.code === "P2034" ||
    value.code === "40001" ||
    value.meta?.code === "40001" ||
    value.meta?.driverAdapterError?.cause?.originalCode === "40001" ||
    serializationFailure(value.cause)
  );
}

/** Retry only a transaction rolled back by PostgreSQL, never a paid transport. */
export async function modelPaymentTransaction<T>(
  db: ModelPaymentDatabase,
  body: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(body, { timeout: 30000, isolationLevel: "ReadCommitted" });
    } catch (error) {
      if (attempt >= 2 || !serializationFailure(error)) throw error;
    }
  }
}
