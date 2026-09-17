"use client";

import { ScheduleEditor } from "@/components/schedules/ScheduleEditor";
import { newEditorSchedule } from "@/components/schedules/ScheduleEditorModel";
import type { MarketScheduleContext } from "@/lib/markets/schedule-context";
import { useTranslations } from "next-intl";

type NewMarketScheduleEditorProps = {
  context: MarketScheduleContext;
  memberSummary?: string;
  onBack: () => void;
  onSaved: (schedule: {
    publicId: string;
    name: string;
    frequency: string;
    isDefault: boolean;
  }) => void;
  projectId: string;
};

export function NewMarketScheduleEditor({
  context,
  memberSummary,
  onBack,
  onSaved,
  projectId,
}: Readonly<NewMarketScheduleEditorProps>) {
  const t = useTranslations("projectMarkets");
  return (
    <ScheduleEditor
      {...context}
      embedded
      isNew
      memberSummary={memberSummary ?? t("newKeywordsJoinSchedule")}
      onCancel={onBack}
      onSaved={onSaved}
      projectId={projectId}
      schedule={newEditorSchedule}
    />
  );
}
