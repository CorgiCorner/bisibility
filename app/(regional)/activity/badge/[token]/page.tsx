import { BadgeArt } from "@/components/achievements/BadgeArt";
import { ThirtyDayMark } from "@/components/achievements/ThirtyDayMark";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { readPublicAchievement } from "@/lib/achievements/sharing";
import { THIRTY_DAYS_KIND } from "@/lib/achievements/thirty-days";
import { normalizeOrigin } from "@/lib/seo/origin";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createTranslator } from "next-intl";
import { cache } from "react";
export const dynamic = "force-dynamic";
const readAward = cache(readPublicAchievement);
type Props = { params: Promise<{ token: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params,
    award = await readAward(token);
  if (!award) return { robots: { index: false, follow: false } };
  const title =
    award.kind === THIRTY_DAYS_KIND ? "30 days of SEO · bisibility" : "7 days · bisibility";
  const description =
    award.kind === THIRTY_DAYS_KIND ? "30 days of SEO" : "A small milestone. A steady habit.";
  return {
    title,
    robots: { index: false, follow: false, noarchive: true },
    openGraph: {
      title,
      description,
      ...(normalizeOrigin(process.env.SITE_URL)
        ? { images: [`${normalizeOrigin(process.env.SITE_URL)}/activity/badge/${token}/image`] }
        : {}),
    },
  };
}
export default async function SharedBadge({ params }: Props) {
  const award = await readAward((await params).token);
  if (!award) notFound();
  const { locale } = await resolveRegionalDocumentLocale();
  const messages = await loadCoreMessages(locale, ["account"]),
    t = createTranslator({ locale, messages, namespace: "account.achievements" });
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-5 py-12 text-center">
      {award.kind === THIRTY_DAYS_KIND ? <ThirtyDayMark /> : <BadgeArt kind={award.kind} />}
      <h1 className="text-[24px] font-semibold">
        {t(
          award.kind === THIRTY_DAYS_KIND
            ? "thirtyTitle"
            : award.kind === "presence"
              ? "presenceTitle"
              : "practiceTitle",
        )}
      </h1>
      <p className="text-[14px] text-fg-muted">{t("publicDescription")}</p>
      <p className="text-[12px] text-fg-muted">bisibility · {award.earnedDay}</p>
    </main>
  );
}
