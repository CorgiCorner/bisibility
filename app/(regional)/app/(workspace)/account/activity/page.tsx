import { AccountShell } from "@/components/account/AccountShell";
import { AchievementsPanel } from "@/components/achievements/AchievementsPanel";
import { Button } from "@/components/ui/Button";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { createIntlTranslator } from "@/i18n/translator.server";
import { readAchievements } from "@/lib/achievements/read";
import { requireSession } from "@/lib/auth/session";
import { projectSeoChallengeEnabled } from "@/lib/challenge-report/feature";
export default async function ActivityPage() {
  const session = await requireSession();
  const runtime = await resolveRegionalDocumentLocale();
  const messages = await loadCoreMessages(runtime.locale, ["account", "challengeReport"]);
  const t = createIntlTranslator(runtime.locale, messages, runtime);
  let challengeEnabled = false;
  let view: Awaited<ReturnType<typeof readAchievements>> = null;
  try {
    [view, challengeEnabled] = await Promise.all([
      readAchievements(session.user.id),
      projectSeoChallengeEnabled(),
    ]);
  } catch {
    return (
      <AccountShell activeSection="activity">
        <p role="status">{t("account.achievements.error")}</p>
      </AccountShell>
    );
  }
  return (
    <AccountShell activeSection="activity">
      {view ? (
        <div className="grid gap-4">
          {challengeEnabled ? (
            <Button
              className="justify-self-start"
              href="/app?challenge=1"
              size="sm"
              variant="secondary"
            >
              {t("challengeReport.openProjectChallenge")}
            </Button>
          ) : null}
          <AchievementsPanel view={view} />
        </div>
      ) : (
        <p>{t("account.achievements.disabled")}</p>
      )}
    </AccountShell>
  );
}
