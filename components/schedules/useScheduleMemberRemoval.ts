"use client";

import { useToast } from "@/components/ui/toast-context";
import { throwScheduleReviewProblem } from "@/lib/schedules/review-problem";
import { rankMembershipChange } from "@/lib/schedules/web-change";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type Dispatch, type SetStateAction, useState } from "react";
import type { ScheduleEditorMember } from "./ScheduleEditorModel";
import { ScheduleReviewCancelled, useScheduleSpendReview } from "./useScheduleSpendReview";

export function useScheduleMemberRemoval({
  canEdit,
  projectId,
  scheduleId,
  pendingMembers,
  setPendingMembers,
}: {
  canEdit: boolean;
  projectId: string;
  scheduleId: string;
  pendingMembers: readonly ScheduleEditorMember[];
  setPendingMembers: Dispatch<SetStateAction<readonly ScheduleEditorMember[]>>;
}) {
  const router = useRouter();
  const spendReview = useScheduleSpendReview(projectId);
  const t = useTranslations("projectRuns.schedules");
  const { showToast } = useToast();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(member: ScheduleEditorMember) {
    if (!canEdit || pendingId !== null) return;
    setError(null);
    if (pendingMembers.some((pending) => pending.publicId === member.publicId)) {
      setPendingMembers((current) =>
        current.filter((pending) => pending.publicId !== member.publicId),
      );
      return;
    }
    setPendingId(member.publicId);
    try {
      await spendReview.run(
        rankMembershipChange(projectId, scheduleId, [member.publicId], "remove"),
        async (review) => {
          const response = await fetch(`/api/check-schedules/${scheduleId}/keywords`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectId,
              keywordIds: [member.publicId],
              ...(review ? { review } : {}),
            }),
          });
          if (!response.ok) {
            throwScheduleReviewProblem(await response.json().catch(() => null));
            throw new Error("schedule_member_removal_failed");
          }
        },
      );
      showToast(t("editor.memberRemoved"), { severity: "success" });
      router.refresh();
    } catch (error) {
      if (error instanceof ScheduleReviewCancelled) return;
      setError(t("editor.memberRemoveFailed"));
    } finally {
      setPendingId(null);
    }
  }
  return { error, pendingId, remove, dialog: spendReview.dialog };
}
