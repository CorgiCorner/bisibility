import { sampleChallengeBody } from "@/lib/challenge-report/fixtures";
import { requireReadableProject } from "@/lib/queries/_auth";
import { publicReportView } from "@/lib/report-sharing/projection";
import { renderReportCard } from "@/lib/report-sharing/render-card";
import { defaultShareSettings } from "@/lib/report-sharing/settings";

export async function GET(_request: Request, { params }: { params: Promise<{ project: string }> }) {
  await requireReadableProject((await params).project);
  return renderReportCard({
    domain: "example.com",
    download: false,
    theme: "dark",
    title: "30 days of SEO",
    view: publicReportView(sampleChallengeBody(), defaultShareSettings()),
  });
}
