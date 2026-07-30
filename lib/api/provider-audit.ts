import "server-only";

import { writeAudit } from "@/lib/auth/audit";
import type { prisma } from "@/lib/db/prisma";
import { providerConnectionAuditResource } from "./audit-resources";

export type ProviderClient = Pick<typeof prisma, "auditLog" | "providerConnection">;

export function auditConnection<T extends Parameters<typeof providerConnectionAuditResource>[0]>(
  connection: T,
) {
  return providerConnectionAuditResource(connection);
}

export function auditProviderMutation(
  input: {
    action: string;
    actorId: string | null;
    after: unknown;
    before?: unknown;
    projectId: string;
    targetId: string;
    targetType?: string;
  },
  client?: ProviderClient,
) {
  const audit = { ...input, targetType: input.targetType ?? "provider_connection" };
  return client ? writeAudit(audit, client) : writeAudit(audit);
}
