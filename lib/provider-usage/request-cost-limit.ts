import "server-only";
import { Prisma } from "@/lib/generated/prisma/client";
import { formatQuantity, type Quantity } from "@usagekit/core";

export function remainingRequestCostLimit(maximum: number | undefined, spent: number) {
  return maximum === undefined ? undefined : new Prisma.Decimal(maximum).minus(spent).toNumber();
}

/** One logical call keeps its limit across concurrent attempts and paid retries. */
export function requestCostLimit(maximum?: number) {
  if (maximum !== undefined && (!Number.isFinite(maximum) || maximum < 0))
    throw new RangeError("Invalid request cost limit");
  let admissionQueue: Promise<void> = Promise.resolve();
  const pending = new Map<string, Prisma.Decimal>();
  const settled = new Map<string, Prisma.Decimal | null>();
  return {
    admit<T>(run: () => Promise<T>): Promise<T> {
      const next = admissionQueue.then(run);
      admissionQueue = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    },
    remaining() {
      if (maximum === undefined) return undefined;
      let remaining = new Prisma.Decimal(maximum);
      for (const cost of [...pending.values(), ...settled.values()]) {
        if (cost === null) throw new Error("Previous request cost is unconfirmed");
        remaining = remaining.minus(cost);
      }
      return remaining.toFixed();
    },
    reserve(id: string, estimate: readonly Quantity[] | undefined, fallback: string) {
      if (maximum === undefined) return;
      const cents =
        estimate?.find((quantity) => quantity.unit === "budget_cents") ??
        estimate?.find((quantity) => quantity.unit === "cents");
      pending.set(id, new Prisma.Decimal(cents ? formatQuantity(cents) : fallback));
    },
    settle(id: string, cost: number | null) {
      if (maximum === undefined) return;
      pending.delete(id);
      settled.set(id, cost === null ? null : new Prisma.Decimal(cost));
    },
    cancel(id: string) {
      pending.delete(id);
    },
  };
}

export type RequestCostLimit = ReturnType<typeof requestCostLimit>;
