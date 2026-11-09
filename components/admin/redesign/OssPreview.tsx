"use client";
import { useTranslations } from "next-intl";
import type { ComponentProps, ReactNode } from "react";
import { OssOpsActions, type PreviewOpsResult } from "./OssOpsActions";
import { type OssPreviewData, ossPreviewFixture } from "./OssPreviewData";
import { OssPreviewScreen, ossNavigation, PreviewShell } from "./PreviewShell";

export function OssPreview({
  initialTab,
  initialView,
  data = ossPreviewFixture,
  moreDetails,
  actions,
  refresh,
}: {
  initialTab?: string;
  initialView?: string;
  data?: OssPreviewData;
  moreDetails?: Partial<Record<string, ReactNode>>;
  actions?: {
    slackConfigured?: boolean;
    onRefresh: () => void;
    onSendTest: () => PreviewOpsResult | void | Promise<PreviewOpsResult | void>;
    onRunSweep: () => PreviewOpsResult | void | Promise<PreviewOpsResult | void>;
  };
  refresh?: ComponentProps<typeof PreviewShell>["refresh"];
}) {
  const t = useTranslations("instanceAdmin.accounts");
  return (
    <PreviewShell
      navigation={ossNavigation}
      initialTab={initialTab}
      initialView={initialView}
      refresh={refresh}
    >
      {(_tab, view) => (
        <>
          <h2 className="text-base font-semibold">
            {view === "Accounts"
              ? t("question")
              : (data[view]?.question ?? ossPreviewFixture[view]?.question)}
          </h2>
          {data[view] && <OssPreviewScreen screen={data[view]} />}
          {view === "Notifications" && actions && <OssOpsActions {...actions} />}
          {moreDetails?.[view]}
        </>
      )}
    </PreviewShell>
  );
}
