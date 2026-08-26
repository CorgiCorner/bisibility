const SERIALIZABLE_CONFLICT_CODE = "P2034";
export const SERIALIZABLE_TRANSACTION_ATTEMPTS = 3;

type PrismaCodeError = { code?: unknown };

function isSerializableConflict(error: unknown) {
  return (error as PrismaCodeError | null)?.code === SERIALIZABLE_CONFLICT_CODE;
}

export async function retrySerializableTransaction<T>(
  operation: () => Promise<T>,
  maxAttempts = SERIALIZABLE_TRANSACTION_ATTEMPTS,
): Promise<T> {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError("Serializable transaction attempts must be a positive integer.");
  }
  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      return await operation();
    } catch (error) {
      if (!isSerializableConflict(error) || attempt === maxAttempts) throw error;
    }
  }
  throw new Error("Serializable transaction retry loop exited unexpectedly.");
}
