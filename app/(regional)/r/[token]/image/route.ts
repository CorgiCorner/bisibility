import { renderReportCard } from "@/lib/report-sharing/render-card";
import { resolveShareToken } from "@/lib/report-sharing/resolve";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const share = await resolveShareToken((await params).token);
  if (!share) return new Response(null, { headers: { "Cache-Control": "no-store" }, status: 404 });
  const url = new URL(request.url);
  return renderReportCard({
    domain: share.domain,
    download: url.searchParams.get("download") === "1",
    faviconDomain: share.domain,
    theme: url.searchParams.get("theme") === "dark" ? "dark" : "light",
    title: share.title,
    view: share.view,
  });
}
