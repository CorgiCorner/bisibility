import "server-only";

import { deploymentMode } from "@/lib/deployment/deployment";
import { publishWorkerIntent } from "@/lib/worker-intents/realtime";

type CreatedUser = Record<string, unknown>;

export async function sendCloudWelcomeSequence(user: CreatedUser) {
  if (deploymentMode() !== "cloud") return;

  return { data: { ...user, welcomeFollowupRequestedAt: new Date() } };
}

export async function wakeCloudWelcomeSequenceWorker() {
  if (deploymentMode() !== "cloud") return;

  void publishWorkerIntent("welcome_followup")
    .then((result) => {
      if (!result.ok) console.error("[welcome] worker wake publish failed");
    })
    .catch(() => undefined);
}
