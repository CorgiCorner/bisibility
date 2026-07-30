import type { Prisma } from "@/lib/generated/prisma/client";
import type { ProviderKind } from "@/lib/providers/types";

export type ProviderChainEntry = {
  enabled: boolean;
  kind: ProviderKind;
  priority: number;
  provider: string;
  status: string;
};

export function providerChainOrderBy(): Prisma.ProviderConnectionOrderByWithRelationInput[] {
  return [{ priority: "asc" }, { provider: "asc" }];
}

export function serpProviderChainOrderBy(): Prisma.ProviderConnectionOrderByWithRelationInput[] {
  return providerChainOrderBy();
}

export function providerChainWhere(kind: ProviderKind): Prisma.ProviderConnectionWhereInput {
  return { enabled: true, kind, status: "connected" };
}

export function compareProviderChainEntries(
  left: Pick<ProviderChainEntry, "priority" | "provider">,
  right: Pick<ProviderChainEntry, "priority" | "provider">,
) {
  return left.priority - right.priority || left.provider.localeCompare(right.provider);
}

export function primaryProviderConnection<T extends ProviderChainEntry>(
  connections: readonly T[],
  kind: ProviderKind,
): T | null {
  return (
    connections
      .filter(
        (connection) =>
          connection.kind === kind && connection.enabled && connection.status === "connected",
      )
      .sort(compareProviderChainEntries)[0] ?? null
  );
}
