import type { ModelPaymentDatabase } from "./admission-storage";

export async function modelPlaygroundSqlNow(db: ModelPaymentDatabase) {
  const [clock] = await db.$transaction(
    (tx) => tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`,
  );
  return clock.now;
}
