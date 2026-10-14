import type { Actor } from "@/lib/auth/authorize";
import type { Role } from "@/lib/generated/prisma/client";
import { vi } from "vitest";
import type { UsageDisplayDatabase } from "./store";

export const projectA = `prj_${"a".repeat(24)}`;
export const projectB = `prj_${"b".repeat(24)}`;
export const member = (id = "editor"): Actor => ({
  id,
  memberships: [{ projectId: "A", role: "owner" }],
});

export function displayDatabase() {
  const documents = new Map<string, unknown>();
  const memberships = new Map<string, Role>([
    ["editor:A", "member"],
    ["other:A", "member"],
    ["viewer:A", "viewer"],
  ]);
  const inactive = new Set<string>();
  const writeModes = new Map<string, string>();
  const projects = [
    { id: "A", publicId: projectA },
    { id: "B", publicId: projectB },
  ];
  const raw = vi.fn(async (parts: TemplateStringsArray, ...values: unknown[]) => {
    const sql = parts.join("?");
    if (sql.includes("FROM users"))
      return inactive.has(String(values[0])) ? [] : [{ id: values[0] }];
    if (sql.includes("FROM memberships")) {
      const role = memberships.get(`${values[0]}:${values[1]}`);
      return role ? [{ role }] : [];
    }
    return [];
  });
  const tx = {
    $queryRaw: raw,
    project: {
      findFirst: vi.fn(
        async ({ where }: { where: { publicId: string } }) =>
          projects.find((p) => p.publicId === where.publicId) ?? null,
      ),
      findUnique: vi.fn(
        async ({ where, select }: { where: { id: string }; select: Record<string, boolean> }) => {
          if (select.usageDisplaySettings)
            return { usageDisplaySettings: documents.get(where.id) ?? null };
          const project = projects.find((p) => p.id === where.id);
          return project ? { ...project, writeMode: writeModes.get(project.id) ?? "active" } : null;
        },
      ),
    },
    projectDefaults: { upsert: vi.fn() },
  };
  const update = vi.fn(
    async ({ where, data }: { where: { id: string }; data: { usageDisplaySettings: unknown } }) => {
      documents.set(where.id, structuredClone(data.usageDisplaySettings));
      return data;
    },
  );
  const transactionPort = { ...tx, project: { ...tx.project, update } };
  const transaction = vi.fn(async (run: (transaction: typeof tx) => Promise<unknown>) =>
    run(transactionPort),
  );
  return {
    db: { $transaction: transaction } as unknown as UsageDisplayDatabase,
    documents,
    memberships,
    inactive,
    writeModes,
    raw,
    tx: transactionPort,
    transaction,
  };
}
