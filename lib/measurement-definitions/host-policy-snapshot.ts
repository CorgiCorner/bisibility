import "server-only";
import { RANK_REPORT_CALENDAR_CONFIGURATION } from "@/lib/rank-reports/host-policy";
import { definitionProjectScope } from "./access";
import type { HostPolicySnapshot } from "./host-policy-contract";
import { hostDefinitionConfigImplemented } from "./host-registry";
import type { DefinitionActorContext, DefinitionDatabase, DefinitionTransaction } from "./model";
import { persistedPolicySchema } from "./schema";
import { definitionAuthorityInstalled } from "./storage";

/** Read-only source snapshot. Missing policy is a named state, never an initializer. */
export async function readHostPolicySnapshot(
  tx: DefinitionTransaction,
  projectId: string,
): Promise<HostPolicySnapshot> {
  if (!(await definitionAuthorityInstalled(tx)))
    return { state: "authority_unavailable", policyEpoch: null, config: null };
  const rows = await tx.$queryRaw<Array<{ epoch: string; config: unknown }>>`
    SELECT "measurementPolicyEpoch"::text AS epoch,"measurementPolicyConfig" AS config FROM projects WHERE id=${projectId}`;
  const row = rows[0];
  if (!row) throw new Error("Measurement policy project is unavailable.");
  if (row.config === null) return { state: "unconfigured", policyEpoch: row.epoch, config: null };
  const parsed = persistedPolicySchema.safeParse(row.config);
  if (!parsed.success) return { state: "unsupported", policyEpoch: row.epoch, config: null };
  const supported =
    hostDefinitionConfigImplemented(parsed.data) &&
    parsed.data.freshness.configurationRevision === RANK_REPORT_CALENDAR_CONFIGURATION;
  return {
    state: supported ? "ready" : "unsupported",
    policyEpoch: row.epoch,
    config: parsed.data,
  };
}
export function readHostDefinitionPolicy(
  db: DefinitionDatabase,
  context: DefinitionActorContext,
  projectId: string,
) {
  return db.$transaction(
    async (tx) => {
      const project = await definitionProjectScope(
        tx,
        context,
        projectId,
        "read",
        "project_defaults",
      );
      return {
        ...(await readHostPolicySnapshot(tx, project.id)),
        projectWritable: project.writeMode === "active" && !project.isSample,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
