import "server-only";

import type { PushMessage, PushSender } from "@/lib/notifications/apns";
import { deleteInvalidPushToken, projectPushRecipients } from "@/lib/notifications/push-tokens";

export type PushDeliveryResult = {
  devices: number;
  failures: string[];
  retryable: boolean;
  sent: number;
};

/**
 * Sends one message to every registered device of the project's members who
 * keep alertPush on. Tokens the push service reports invalid are deleted.
 */
export async function deliverPushToProject(
  sender: PushSender,
  projectInternalId: string,
  message: PushMessage,
): Promise<PushDeliveryResult> {
  const recipients = await projectPushRecipients(projectInternalId, sender.topic);
  const result: PushDeliveryResult = {
    devices: recipients.length,
    failures: [],
    retryable: false,
    sent: 0,
  };
  for (const recipient of recipients) {
    try {
      const outcome = await sender.send(recipient.token, recipient.environment, message);
      if (outcome.kind === "sent") {
        result.sent += 1;
      } else if (outcome.kind === "invalid_token") {
        await deleteInvalidPushToken(recipient.token);
      } else {
        result.failures.push(outcome.reason);
        if (outcome.kind === "retryable") result.retryable = true;
      }
    } catch (error) {
      result.failures.push(error instanceof Error ? error.name : "PushError");
      result.retryable = true;
    }
  }
  return result;
}
