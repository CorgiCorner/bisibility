"use server";

import {
  AdminActionRateLimitError,
  consumeAdminActionBudget,
} from "@/lib/auth/admin-action-budget";
import {
  AdminTwoFactorRequiredError,
  requireAdminTwoFactorForDangerousAction,
} from "@/lib/auth/admin-dangerous-action";
import { getInstanceAdminSession } from "@/lib/auth/instance-admin";
import { deploymentMode } from "@/lib/deployment/deployment";
import { instanceMailFormSchema } from "@/lib/email/instance-mail-schema";
import {
  clearInstanceMailConfig,
  type InstanceMailCredentialInput,
  InstanceMailSettingsError,
  readInstanceMailStatus,
  saveInstanceMailConfig,
} from "@/lib/email/instance-mail-store";
import { z } from "zod";

export type InstanceMailSettingsResult = {
  status:
    | "cleared"
    | "forbidden"
    | "invalid"
    | "rate_limited"
    | "saved"
    | "two_factor_required"
    | "unavailable";
};

async function authorizedMailActor() {
  const session = await getInstanceAdminSession();
  if (!session || deploymentMode() === "cloud") return null;
  await requireAdminTwoFactorForDangerousAction(session, "change_mail_settings");
  await consumeAdminActionBudget(session.user.id);
  return { actorId: session.user.id };
}

function credentialsFrom(
  values: z.infer<ReturnType<typeof instanceMailFormSchema>>,
): InstanceMailCredentialInput {
  if (values.provider === "resend") return { resendApiKey: values.resendApiKey.trim() };
  if (values.provider === "ses") {
    return {
      ...(values.sesAccessKeyId ? { sesAccessKeyId: values.sesAccessKeyId } : {}),
      sesRegion: values.sesRegion,
      ...(values.sesSecretAccessKey ? { sesSecretAccessKey: values.sesSecretAccessKey } : {}),
    };
  }
  return {
    smtpHost: values.smtpHost,
    smtpPassword: values.smtpPassword,
    smtpPort: Number(values.smtpPort),
    smtpUsername: values.smtpUsername.trim(),
  };
}

export async function saveInstanceMailSettings(
  input: unknown,
): Promise<InstanceMailSettingsResult> {
  try {
    const actor = await authorizedMailActor();
    if (!actor) return { status: "forbidden" };
    const existing = await readInstanceMailStatus();
    const replaceFlag = z.object({ replaceCredentials: z.boolean() }).safeParse(input);
    if (!replaceFlag.success) return { status: "invalid" };
    const parsed = instanceMailFormSchema({
      credentialsRequired: replaceFlag.data.replaceCredentials || !existing.credentialsConfigured,
      senderRequired: existing.sender.length === 0,
    }).safeParse(input);
    if (!parsed.success) return { status: "invalid" };
    const sender = parsed.data.sender || existing.sender;
    await saveInstanceMailConfig({
      actorId: actor.actorId,
      credentials:
        replaceFlag.data.replaceCredentials || !existing.credentialsConfigured
          ? credentialsFrom(parsed.data)
          : null,
      provider: parsed.data.provider,
      sender,
    });
    return { status: "saved" };
  } catch (error) {
    if (error instanceof InstanceMailSettingsError) return { status: "invalid" };
    if (error instanceof AdminTwoFactorRequiredError) return { status: error.code };
    if (error instanceof AdminActionRateLimitError) return { status: "rate_limited" };
    console.error("[email] Saving instance mail settings failed.");
    return { status: "unavailable" };
  }
}

export async function clearInstanceMailSettings(): Promise<InstanceMailSettingsResult> {
  try {
    const actor = await authorizedMailActor();
    if (!actor) return { status: "forbidden" };
    await clearInstanceMailConfig(actor.actorId);
    return { status: "cleared" };
  } catch (error) {
    if (error instanceof AdminTwoFactorRequiredError) return { status: error.code };
    if (error instanceof AdminActionRateLimitError) return { status: "rate_limited" };
    console.error("[email] Clearing instance mail settings failed.");
    return { status: "unavailable" };
  }
}
