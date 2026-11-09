"use client";

import { useTranslations } from "next-intl";
import type { ComponentProps } from "react";
import { type OssAdminData, renderOssView } from "./OssAdminViews";
import { OssPageLoading } from "./OssPageLoading";
import { ossPreviewFixture } from "./OssPreviewData";
import { ossNavigation, PreviewShell } from "./PreviewShell";

/** Typed, neutral composition for the self-hosted administrator. */
export function OssAdminComposition({
  data,
  initialTab,
  initialView,
  refresh,
  loading,
  view,
}: {
  data: OssAdminData;
  view?: string;
  initialTab?: string;
  initialView?: string;
  refresh?: ComponentProps<typeof PreviewShell>["refresh"];
  loading?: "operations" | "administration" | "audit";
}) {
  const t = useTranslations("instanceAdmin.accounts");
  if (view) return renderOssView(view, data);
  return (
    <PreviewShell
      navigation={ossNavigation}
      initialTab={initialTab}
      initialView={initialView}
      refresh={refresh}
    >
      {(_tab, view) => (
        <div className="grid min-w-0 gap-4">
          <h2 className="text-base font-semibold">
            {view === "Accounts" ? t("question") : ossPreviewFixture[view].question}
          </h2>
          {loading === "operations" &&
          ["Status", "Worker", "Checks", "Data sources", "Notifications"].includes(view) ? (
            <OssPageLoading view={view} />
          ) : loading === "administration" && view === "Settings" ? (
            <OssPageLoading view={view} />
          ) : loading === "audit" && view === "Audit" ? (
            <OssPageLoading view={view} />
          ) : (
            renderOssView(
              view,
              loading === "administration" && view === "Accounts" && data.administration
                ? { ...data, administration: { ...data.administration, accountsState: "loading" } }
                : data,
            )
          )}
        </div>
      )}
    </PreviewShell>
  );
}
