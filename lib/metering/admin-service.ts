import "server-only";
import { writeAudit } from "@/lib/auth/audit";
import { requireInstanceAdmin } from "@/lib/auth/instance-admin";
import { readMeteringAdmin } from "./admin-data";
import type { MeteringAdminPage } from "./admin-types";

export async function getMeteringAdminPage(input: {
  month?: string;
  project?: string;
}): Promise<MeteringAdminPage> {
  const session = await requireInstanceAdmin();
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)).toISOString().slice(0, 7),
  );
  const month = input.month ?? months[0] ?? now.toISOString().slice(0, 7);
  const project = input.project || null;
  if (
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
    (project && !/^[a-zA-Z0-9_-]{1,128}$/.test(project))
  )
    throw new Error("Invalid metering filter");
  await writeAudit({
    action: "instance_admin.metering_viewed",
    actorId: session.user.id,
    targetType: "instance_ops",
    targetId: "metering",
    after: { month, project: project ?? "all" },
  });
  try {
    return { month, project, months, data: await readMeteringAdmin({ month, project }) };
  } catch {
    console.error("[metering] admin data unavailable", {
      month,
      projectSelected: project !== null,
    });
    return { month, project, months, data: null };
  }
}
