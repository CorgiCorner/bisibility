import "server-only";
import { requirePublicId } from "@/lib/db/public-id-resources";
import type { MonitorDefinition } from "@/lib/local-monitor-store/model";
import type { LocalProjectScope } from "@/lib/local-monitoring-store/access";
import type { LocalPolicyPort, LocalTransaction } from "@/lib/local-monitoring-store/context";
import { createLocalMeasurementTargetInTransaction } from "@/lib/local-monitoring-store/create-target";
export async function materializeMonitorTargets(
  tx: LocalTransaction,
  scope: LocalProjectScope,
  definition: MonitorDefinition,
  policy: LocalPolicyPort,
) {
  const targets = [];
  for (const keyword of definition.keywords)
    for (const point of definition.grid.points) {
      targets.push(
        await createLocalMeasurementTargetInTransaction(
          tx,
          scope,
          {
            projectId: requirePublicId(scope.project.publicId, "prj"),
            keywordId: requirePublicId(keyword.publicId, "kw"),
            ...definition.axes,
            ...point.point.coordinate,
          },
          policy,
          point.point,
        ),
      );
    }
  if (
    !targets.length ||
    targets.length > 100 ||
    new Set(targets.map((value) => value.id)).size !== targets.length
  )
    throw new Error("Invalid complete monitor target set.");
  return targets;
}
