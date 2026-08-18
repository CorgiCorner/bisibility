import "server-only";

import { deploymentMode } from "@/lib/deployment/deployment";
import { startWelcomeFollowupWorkflow } from "@/lib/temporal/welcome-email-client";

type CreatedUser = { email: string; id: string; name: string };

export async function sendCloudWelcomeSequence(user: CreatedUser) {
  if (deploymentMode() !== "cloud") return;

  try {
    await startWelcomeFollowupWorkflow(user.id);
  } catch {
    console.error("[welcome] follow-up workflow start failed");
  }
}
