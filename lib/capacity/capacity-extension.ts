import "server-only";
import { assertResolvedCapacity, readEnvironmentCapacity } from "@/lib/capacity/env-capacity";
import type { CapacityRequest } from "@/lib/capacity/types";
import type { Prisma } from "@/lib/generated/prisma/client";

export function readCapacityLimit(_ownerId: string, dimension: string): Promise<number | null> {
  return Promise.resolve(readEnvironmentCapacity(dimension));
}

export function assertCapacity(
  tx: Prisma.TransactionClient,
  ownerId: string,
  dimension: string,
  requested: CapacityRequest,
) {
  return assertResolvedCapacity(
    tx,
    ownerId,
    dimension,
    requested,
    readEnvironmentCapacity(dimension),
    dimension === "keywordsPerProject" ? "project" : "account",
  );
}

export async function prepareResourceCapacity(
  _tx: Prisma.TransactionClient,
  _change: import("@/lib/capacity/resource-change").ResourceChange,
): Promise<import("@/lib/capacity/resource-change").ResourceCapacityCheck> {
  return { enabled: false, check: async () => {} };
}

export async function readReachedProjectCapacity(
  _ownerId: string,
): Promise<number | null | undefined> {
  return undefined;
}
