import "server-only";
import type { EvidenceProjection } from "@/lib/provider-evidence/projection/model";
import { readCheckEvidence } from "@/lib/provider-evidence/projection/read";
export async function readHeartbeatEvidence(
  rows: readonly { publicId?: string; keyword: { projectId: string } }[],
) {
  const result = new Map<string, EvidenceProjection | null>();
  const projects = new Set(rows.filter((row) => row.publicId).map((row) => row.keyword.projectId));
  for (const projectId of projects) {
    const values = await readCheckEvidence(projectId, {
      checkIds: rows
        .filter((row) => row.keyword.projectId === projectId)
        .flatMap((row) => (row.publicId ? [row.publicId] : [])),
    });
    for (const [id, value] of values) result.set(id, value);
  }
  return result;
}
