import "server-only";

import { readConsentFromCookies, trackServerEvent } from "@/lib/analytics/server";
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

type UserCreationContext = {
  params?: Record<string, unknown>;
  path?: string;
} | null;

export function signupMethodFromContext(
  context: UserCreationContext,
): "github" | "google" | "otp" | null {
  if (context?.path === "/sign-in/email-otp") return "otp";
  const provider = context?.params?.id;
  if (provider === "github" || provider === "google") return provider;
  const callbackProvider = context?.path?.match(/^\/callback\/(github|google)$/)?.[1];
  return callbackProvider === "github" || callbackProvider === "google" ? callbackProvider : null;
}

export async function handleCreatedUser(
  user: { id: string },
  context: UserCreationContext,
): Promise<void> {
  await wakeCloudWelcomeSequenceWorker();
  const method = signupMethodFromContext(context);
  if (!method) return;
  await trackServerEvent("user_signed_up", {
    consent: await readConsentFromCookies(),
    distinctId: user.id,
    properties: { method },
  });
}
