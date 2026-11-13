import { sampleChallengeBody } from "@/lib/challenge-report/fixtures";
import { expect, it } from "vitest";
import { shareReportImage } from "./image";
import { shareImageCopy } from "./image-facts";
import { publicReportView } from "./projection";
import { defaultShareSettings } from "./settings";

it("renders a public report card in both themes", async () => {
  const copy = shareImageCopy(publicReportView(sampleChallengeBody(), defaultShareSettings()));
  const labels = {
    day: "Nov 12 to Dec 11 (30 days)",
    clickTrend: "Daily organic search clicks",
    facts: { clicks: "Clicks", conversions: "Conversions", top10: "Top 10" },
    headline: "Organic search clicks",
  };
  for (const theme of ["light", "dark"] as const) {
    const response = await shareReportImage({
      copy,
      domain: "example.com",
      download: theme === "dark",
      labels,
      theme,
      title: "30 days of SEO",
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Robots-Tag")).toContain("noindex");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  }
}, 20000);
