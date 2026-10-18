import { BadgeArt } from "@/components/achievements/BadgeArt";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { readPublicAchievement } from "@/lib/achievements/sharing";
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
  return {
    title: "7 days · bisibility",
    robots: { index: false, follow: false, noarchive: true },
    openGraph: {
      title: "7 days · bisibility",
      description: "A small milestone. A steady habit.",
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
      <BadgeArt kind={award.kind} />
      <h1 className="text-[24px] font-semibold">
        {t(award.kind === "presence" ? "presenceTitle" : "practiceTitle")}
      </h1>
      <p className="text-[14px] text-fg-muted">{t("publicDescription")}</p>
      <p className="text-[12px] text-fg-muted">bisibility · {award.earnedDay}</p>
    </main>
  );
}
