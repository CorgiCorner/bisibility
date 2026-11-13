import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { createIntlTranslator } from "@/i18n/translator.server";
import { badgeImage } from "@/lib/achievements/image";
import {
  markProjectChallengeCardDownloaded,
  readProjectChallenge,
} from "@/lib/challenge-report/project-challenge";
import { requireReadableProject } from "@/lib/queries/_auth";
import { reportCardFavicon } from "@/lib/report-sharing/favicon";
import { shareReportImage } from "@/lib/report-sharing/image";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ project: string }> }) {
  const { project: ref } = await params;
  const { actor, project } = await requireReadableProject(ref);
  const challenge = await readProjectChallenge(actor.id, project.id);
  if (!challenge)
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  const query = new URL(request.url).searchParams;
  const download = query.get("download") === "1";
  if (query.get("badge") === "1" && challenge.progress.earnedDay) {
    return badgeImage("thirty_days", challenge.progress.earnedDay, download);
  }
  const runtime = await resolveRegionalDocumentLocale();
  const messages = await loadCoreMessages(runtime.locale, ["challengeReport"]);
  const t = createIntlTranslator(runtime.locale, messages, runtime);
  const response = await shareReportImage({
    copy: {
      facts: [
        { label: "existingVsNew", value: String(challenge.pageCount) },
        {
          label: "clicks",
          value:
            challenge.baselineClicks?.toLocaleString(runtime.locale) ??
            t("challengeReport.stateNoData"),
        },
      ],
      headline: t("challengeReport.dayOne"),
      headlineTile: null,
    },
    domain: project.domain ?? project.name,
    download,
    favicon: await reportCardFavicon(project.domain),
    labels: {
      day: t("challengeReport.cardStarted", { date: challenge.joinedOn }),
      headline: "",
      facts: {
        existingVsNew: t("challengeReport.baselinePages"),
        clicks: t("challengeReport.baselineClicks"),
      },
    },
    theme: "dark",
    title: t("challengeReport.journeyName"),
  });
  if (download) await markProjectChallengeCardDownloaded(actor.id, project.id);
  return response;
}
