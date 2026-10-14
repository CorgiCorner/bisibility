import { configureMeasurementDefinitionPolicyAction } from "@/lib/actions/measurement-definition-policy";
import type { Actor } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";
import { readHostDefinitionPolicy } from "@/lib/measurement-definitions/host-policy-snapshot";
import { MeasurementPolicySettingsCard } from "./MeasurementPolicySettingsCard";

/** Existing Tracking RSC entry. It reads authority and never configures on render. */
export async function MeasurementPolicySettingsSection({
  actor,
  canEdit,
  projectId,
}: Readonly<{ actor: Actor; canEdit: boolean; projectId: string }>) {
  const snapshot = await readHostDefinitionPolicy(prisma, { actor }, projectId);
  return (
    <MeasurementPolicySettingsCard
      canEdit={canEdit && snapshot.projectWritable}
      configure={configureMeasurementDefinitionPolicyAction}
      key={`${snapshot.policyEpoch}:${snapshot.state}`}
      projectId={projectId}
      snapshot={snapshot}
    />
  );
}
