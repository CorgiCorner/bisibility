import "server-only";
import { decryptSecret, encryptSecret } from "@/lib/providers/crypto";
import { z } from "zod";

const reference = z
  .object({
    type: z.literal("backlinks-snapshot"),
    projectId: z.string().min(1),
    id: z.string().min(1),
    fetchedRowCount: z.number().int().nonnegative(),
  })
  .strict();

export function backlinksSnapshotReference(snapshot: {
  id: string;
  projectId: string;
  fetchedRowCount: number;
}) {
  return encryptSecret(
    JSON.stringify({
      type: "backlinks-snapshot",
      id: snapshot.id,
      projectId: snapshot.projectId,
      fetchedRowCount: snapshot.fetchedRowCount,
    }),
  );
}

export function openBacklinksSnapshotReference(value: string | undefined, projectId: string) {
  if (!value || value.length > 32768) return null;
  try {
    const parsed = reference.parse(JSON.parse(decryptSecret(value)));
    return parsed.projectId === projectId ? parsed : null;
  } catch {
    return null;
  }
}
