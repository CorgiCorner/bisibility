import "server-only";
import { getInstanceAdminEmailAllowance } from "@/lib/email/allowance";
import {
  loadInstanceMailSettingsView,
  refreshInstanceMailRuntime,
} from "@/lib/email/instance-mail-store";
import { isEmailConfigured } from "@/lib/email/registry";
import { ossAdminSession } from "./oss-access";

export async function getOssEmailSending(now = new Date()) {
  if (!(await ossAdminSession())) return null;
  return { allowance: await getInstanceAdminEmailAllowance(now) };
}

export async function getOssEmailSettings() {
  if (!(await ossAdminSession())) return null;
  const mailSettings = await loadInstanceMailSettingsView();
  await refreshInstanceMailRuntime();
  return {
    account: null,
    mailSettings,
    mailerConfigured: isEmailConfigured(),
    twoFactorEnabled: mailSettings.twoFactorEnabled,
  };
}
