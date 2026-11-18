import type {
  ResetAccountLimitsResult,
  SetAccountStateResult,
} from "@/lib/actions/instance-admin-account-actions";
import type { InstanceMailSettingsResult } from "@/lib/actions/instance-mail-settings";

export async function setInstanceAdminAccountDeactivated(): Promise<SetAccountStateResult> {
  return { status: "forbidden", message: "This action is unavailable in preview." };
}

export async function resetInstanceAdminAccountLimits(): Promise<ResetAccountLimitsResult> {
  return { status: "forbidden", message: "This action is unavailable in preview." };
}

export async function saveInstanceMailSettings(): Promise<InstanceMailSettingsResult> {
  return { status: "unavailable" };
}

export async function clearInstanceMailSettings(): Promise<InstanceMailSettingsResult> {
  return { status: "unavailable" };
}

export async function lookupOssAdminAccount() {
  return {
    status: "found" as const,
    account: (await import("@/components/admin/pages/page-fixtures.test-fixture")).account,
  };
}
export async function sendTestSlackNotification() {
  return { status: "not_configured" as const };
}
export async function runOpsSweepNow() {
  return { status: "not_configured" as const };
}

/**
 * Preview transport for the assistant safeguards card: it never writes application data. The
 * reason is required by the real action and ignored here.
 */
export async function setAssistantKillSwitch(level: "off" | "credits" | "all", _reason: string) {
  return { ok: true as const, level };
}

export async function setAssistantGuard() {
  return { ok: false as const };
}
