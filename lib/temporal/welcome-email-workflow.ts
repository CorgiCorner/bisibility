import { proxyActivities, sleep } from "@temporalio/workflow";
import type {
  sendWelcomeFollowupActivity as sendFollowupActivity,
  sendWelcomeEmailActivity as sendWelcomeActivity,
} from "./welcome-email-activity";

const { sendWelcomeEmailActivity, sendWelcomeFollowupActivity } = proxyActivities<{
  sendWelcomeEmailActivity: typeof sendWelcomeActivity;
  sendWelcomeFollowupActivity: typeof sendFollowupActivity;
}>({
  retry: {
    backoffCoefficient: 2,
    initialInterval: "10 seconds",
    maximumAttempts: 24,
    maximumInterval: "10 minutes",
  },
  startToCloseTimeout: "1 minute",
});

export async function welcomeFollowupWorkflow(input: { userId: string }) {
  await sleep("1 hour");
  let welcomeResult: { status: string } | undefined;
  try {
    welcomeResult = await sendWelcomeEmailActivity(input);
  } catch {
    // Welcome email exhausted its activity retries; the follow-up is independent.
  }
  if (welcomeResult?.status === "invited_member") {
    return welcomeResult;
  }
  await sleep("47 hours");
  return sendWelcomeFollowupActivity(input);
}
