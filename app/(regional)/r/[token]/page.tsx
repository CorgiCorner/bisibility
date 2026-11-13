import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { PublicReportScreen } from "@/components/report-sharing/PublicReportScreen";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { projectSeoChallengeEnabled } from "@/lib/challenge-report/feature";
import { resolveShareToken, scheduleShareView, viewerCanShare } from "@/lib/report-sharing/resolve";
import { normalizeOrigin } from "@/lib/seo/origin";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";

export const dynamic = "force-dynamic";

const readShare = cache((token: string, stage?: string) =>
  resolveShareToken(token, new Date(), stage),
);

type Props = {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{ stage?: string | string[] }>;
};

function stageParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { token } = await params;
  const stage = stageParam(searchParams ? (await searchParams).stage : undefined);
  const share = await readShare(token, stage);
  if (!share) notFound();
  const origin = normalizeOrigin(process.env.SITE_URL);
  const image = origin ? `${origin}/r/${token}/image` : null;
  const description = share.domain || share.title;
  return {
    description,
    openGraph: {
      description,
      title: share.title,
      ...(image ? { images: [image] } : {}),
    },
    ...(share.view.noindex ? { robots: { follow: false, index: false, noarchive: true } } : {}),
    title: share.title,
    twitter: {
      card: "summary_large_image",
      description,
      title: share.title,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default async function PublicReportPage({ params, searchParams }: Props) {
  const { token } = await params;
  const stage = stageParam(searchParams ? (await searchParams).stage : undefined);
  const share = await readShare(token, stage);
  if (!share) notFound();
  scheduleShareView(share.linkId, await headers());
  const [canShare, runtime, challengeEnabled] = await Promise.all([
    viewerCanShare(share.projectId, share.writeMode),
    resolveRegionalDocumentLocale(),
    projectSeoChallengeEnabled(),
  ]);
  const messages = await loadCoreMessages(runtime.locale, ["shared", "challengeReport"]);
  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      messages={messages}
      timeZone={runtime.timeZone}
    >
      <PublicReportScreen
        canShare={canShare}
        challengeEnabled={challengeEnabled}
        domain={share.domain}
        reports={share.reports}
        title={share.title}
        token={token}
        view={share.view}
      />
    </FeatureMessagesProvider>
  );
}
