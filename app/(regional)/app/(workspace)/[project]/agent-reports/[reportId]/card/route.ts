import { parseChallengeReportBody } from "@/lib/challenge-report/schema";
import { isPublicIdOfType } from "@/lib/db/public-id-resources";
import { requireReadableProject } from "@/lib/queries/_auth";
import { privateReportCardView } from "@/lib/report-sharing/projection";
import { renderReportCard } from "@/lib/report-sharing/render-card";
import { findChallengeReport } from "@/lib/report-sharing/store";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ project: string; reportId: string }> },
) {
  const { project: ref, reportId } = await params;
  if (!isPublicIdOfType(reportId, "agr")) notFound();
  const { project } = await requireReadableProject(ref);
  const report = await findChallengeReport(project.id, reportId);
  const parsed = parseChallengeReportBody(report?.body);
  if (!report || !parsed.success) notFound();
  const query = new URL(request.url).searchParams;
  return renderReportCard({
    domain: project.domain ?? project.name,
    download: query.get("download") === "1",
    faviconDomain: project.domain,
    theme:
      (query.get("theme") ?? (parsed.data.journey ? "dark" : "light")) === "dark"
        ? "dark"
        : "light",
    title: report.title,
    view: privateReportCardView(parsed.data, query.get("tiles")?.split(",")),
  });
}
