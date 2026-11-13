"use client";

import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/toast-context";
import type { ChallengeReportBody } from "@/lib/challenge-report/schema";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ChallengeReportLessonsForm } from "./ChallengeReportLessonsForm";
import { ChallengeReportView } from "./ChallengeReportView";

type Result = { ok: true } | { code?: string; ok: false };

export function ChallengeReportRefreshButton({
  projectId,
  refreshAction,
  reportId,
}: Readonly<{
  projectId: string;
  refreshAction: (input: unknown) => Promise<Result>;
  reportId: string;
}>) {
  const t = useTranslations("challengeReport");
  const router = useRouter();
  const { showToast } = useToast();
  const [refreshing, setRefreshing] = useState(false);
  async function refresh() {
    setRefreshing(true);
    const result = await refreshAction({ projectId, reportId });
    setRefreshing(false);
    if (!result.ok) {
      showToast(t("failed"), { severity: "error" });
      return;
    }
    showToast(t("refreshed"), { severity: "success" });
    router.refresh();
  }
  return (
    <Button loading={refreshing} onClick={() => void refresh()} size="sm" variant="secondary">
      {t("refresh")}
    </Button>
  );
}

export function ChallengeReportScreen({
  body,
  canEditLessons,
  projectId,
  reportId,
  saveLessonsAction,
}: Readonly<{
  body: ChallengeReportBody;
  canEditLessons: boolean;
  projectId: string;
  reportId: string;
  saveLessonsAction?: (input: unknown) => Promise<Result>;
}>) {
  return (
    <div className="grid gap-4">
      <ChallengeReportView
        body={body}
        projectId={projectId}
        lessonSlot={
          canEditLessons && saveLessonsAction ? (
            <ChallengeReportLessonsForm
              lessons={body.lessons}
              projectId={projectId}
              reportId={reportId}
              saveAction={saveLessonsAction}
            />
          ) : undefined
        }
      />
    </div>
  );
}
