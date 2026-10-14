import "server-only";
import { writeAudit } from "@/lib/auth/audit";
import { requireInstanceAdmin } from "@/lib/auth/instance-admin";
import { recoveryFiltersSchema } from "./input";
import { readRecoveryPage } from "./read";

export async function getRecoveryPage(input: unknown) {
  const session = await requireInstanceAdmin();
  const filters = recoveryFiltersSchema.parse(input);
  await writeAudit({
    action: "instance_admin.metering_recovery_viewed",
    actorId: session.user.id,
    targetType: "instance_ops",
    targetId: "metering-recovery",
    after: { category: filters.category ?? "all" },
  });
  return readRecoveryPage(session.user.id, filters);
}

export async function getRecoveryLanding() {
  await requireInstanceAdmin();
  try {
    return await getRecoveryPage({});
  } catch {
    return null;
  }
}
