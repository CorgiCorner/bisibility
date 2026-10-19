import "server-only";
import { refreshInstanceMailRuntime } from "@/lib/email/instance-mail-store";
import { isEmailConfigured } from "@/lib/email/registry";
import { normalizeOrigin } from "@/lib/seo/origin";
import { achievementEmailsEnabled } from "./config";

export async function achievementMailAvailable() {
  if (!achievementEmailsEnabled()) return false;
  const origin = normalizeOrigin(process.env.SITE_URL);
  if (!origin || !/^https?:\/\//.test(origin)) return false;
  try {
    await refreshInstanceMailRuntime();
    return isEmailConfigured();
  } catch {
    return false;
  }
}
