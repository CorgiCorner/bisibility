"use server";

import { getInstanceAdminSession } from "@/lib/auth/instance-admin";
import { getTwoFactorSecurityContext } from "@/lib/auth/two-factor-management-context";
import { TwoFactorManagementError } from "@/lib/auth/two-factor-management-error";
import { confirmEnabledTwoFactorCode } from "@/lib/auth/two-factor-step-up";
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
    | "step_up_failed"
    | "unavailable";
};

const clearSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
});

function stepUpStatus(error: TwoFactorManagementError): InstanceMailSettingsResult["status"] {
  if (error.code === "rate_limited" || error.code === "step_up_locked") return "rate_limited";
  if (error.code === "step_up_failed") return "step_up_failed";
  return "unavailable";
}

async function authorizedMailActor() {
  const session = await getInstanceAdminSession();
  if (!session || deploymentMode() === "cloud") return null;
  const context = await getTwoFactorSecurityContext(session);
  if (!context.twoFactorEnabled) return null;
  return context;
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
    await confirmEnabledTwoFactorCode(actor, parsed.data.code);
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
    if (error instanceof TwoFactorManagementError) return { status: stepUpStatus(error) };
    console.error("[email] Saving instance mail settings failed.");
    return { status: "unavailable" };
  }
}

export async function clearInstanceMailSettings(
  input: unknown,
): Promise<InstanceMailSettingsResult> {
  try {
    const actor = await authorizedMailActor();
    if (!actor) return { status: "forbidden" };
    const parsed = clearSchema.safeParse(input);
    if (!parsed.success) return { status: "invalid" };
    await confirmEnabledTwoFactorCode(actor, parsed.data.code);
    await clearInstanceMailConfig(actor.actorId);
    return { status: "cleared" };
  } catch (error) {
    if (error instanceof TwoFactorManagementError) return { status: stepUpStatus(error) };
    console.error("[email] Clearing instance mail settings failed.");
    return { status: "unavailable" };
  }
}
