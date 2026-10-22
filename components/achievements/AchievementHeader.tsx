import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { achievementsEnabled } from "@/lib/achievements/config";
import { readAchievementHeader } from "@/lib/achievements/read";
import { requireSession } from "@/lib/auth/session";
import { FireIcon } from "@phosphor-icons/react/dist/ssr/Fire";
import Link from "next/link";
import { createTranslator } from "next-intl";
import { ActivityVisit } from "./ActivityVisit";
export async function AchievementHeader() {
  if (!achievementsEnabled()) return null;
  try {
    const session = await requireSession(),
      view = await readAchievementHeader(session.user.id);
    if (!view?.enabled) return null;
    const { locale } = await resolveRegionalDocumentLocale();
    const messages = await loadCoreMessages(locale, ["account"]),
      t = createTranslator({ locale, messages, namespace: "account.achievements" });
    return (
      <>
        <ActivityVisit key={view.timeZone} timeZone={view.timeZone} />
        {view.showHeader ? (
          <Link
            href="/app/account/activity"
            aria-label={`${t("title")}: ${t("days", { count: view.current })}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-control border border-border px-2 text-[12px] text-fg-muted no-underline hover:bg-bg-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <FireIcon weight="regular" aria-hidden size={14} />
            <span className="tabular-nums">{view.current}</span>
          </Link>
        ) : null}
      </>
    );
  } catch {
    return null;
  }
}
