"use client";

import { Button } from "@/components/ui/Button";
import type { RetrievedResults } from "@/lib/checks/contract";
import type { KeywordRow } from "@/lib/queries/keywords";
import { downloadTextFile } from "@/lib/ui/download";
import { useTranslations } from "next-intl";
import { snapshotCsv, snapshotExportName, snapshotJson } from "./snapshot-export";

export function SnapshotDownloads({
  results,
  keyword,
}: Readonly<{
  results: Extract<RetrievedResults, { tier: "full" }>;
  keyword?: { keyword?: string; location: KeywordRow["location"]; device: string };
}>) {
  const t = useTranslations("projectRankTracker.keywordDetail.results");
  const market = {
    location: keyword?.location.displayName ?? "market",
    device: keyword?.device ?? "device",
  };
  function download(format: "csv" | "json") {
    downloadTextFile(
      format === "csv" ? snapshotCsv(results) : snapshotJson(results),
      snapshotExportName(keyword?.keyword ?? "keyword", market, results, format),
      format === "csv" ? "text/csv;charset=utf-8" : "application/json;charset=utf-8",
    );
  }
  return (
    <div className="border-b border-border px-4 py-3 sm:px-5" data-testid="snapshot-downloads">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          className="min-h-11 w-full sm:min-h-0 sm:w-auto"
          size="sm"
          variant="outline"
          onClick={() => download("csv")}
        >
          {t("downloadCsv")}
        </Button>
        <Button
          className="min-h-11 w-full sm:min-h-0 sm:w-auto"
          size="sm"
          variant="outline"
          onClick={() => download("json")}
        >
          {t("downloadJson")}
        </Button>
      </div>
      <p className="mb-0 mt-2 text-xs leading-5 text-fg-muted">{t("normalizedDownloadNote")}</p>
    </div>
  );
}
