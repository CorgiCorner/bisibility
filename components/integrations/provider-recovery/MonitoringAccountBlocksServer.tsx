import { readMonitoringAccountBlocks } from "@/lib/integrations/provider-recovery/monitoring";
import { MonitoringAccountBlocks } from "./MonitoringAccountBlocks";

export async function MonitoringAccountBlocksServer({
  projectId,
  projectRef,
}: {
  projectId: string;
  projectRef: string;
}) {
  const blocks = await readMonitoringAccountBlocks(projectId);
  return <MonitoringAccountBlocks blocks={blocks} projectRef={projectRef} />;
}
