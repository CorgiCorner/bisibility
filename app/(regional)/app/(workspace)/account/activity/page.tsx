import { AccountShell } from "@/components/account/AccountShell";
import { AchievementsPanel } from "@/components/achievements/AchievementsPanel";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { createIntlTranslator } from "@/i18n/translator.server";
import { readAchievements } from "@/lib/achievements/read";
import { requireSession } from "@/lib/auth/session";
export default async function ActivityPage() {
  const session = await requireSession();
  const runtime = await resolveRegionalDocumentLocale();
  const messages = await loadCoreMessages(runtime.locale, ["account"]);
  const t = createIntlTranslator(runtime.locale, messages, runtime);
  let view: Awaited<ReturnType<typeof readAchievements>> = null;
  try {
    view = await readAchievements(session.user.id);
  } catch {
    return (
      <AccountShell activeSection="activity">
        <p role="status">{t("account.achievements.error")}</p>
      </AccountShell>
    );
  }
  return (
    <AccountShell activeSection="activity">
      {view ? <AchievementsPanel view={view} /> : <p>{t("account.achievements.disabled")}</p>}
    </AccountShell>
  );
}
