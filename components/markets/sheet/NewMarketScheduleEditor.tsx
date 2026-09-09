"use client";

import { ScheduleEditor } from "@/components/schedules/ScheduleEditor";
import { newEditorSchedule } from "@/components/schedules/ScheduleEditorModel";
import type { MarketScheduleContext } from "@/lib/markets/schedule-context";

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
  memberSummary = "Keywords will join this schedule when you create the market.",
  onBack,
  onSaved,
  projectId,
}: Readonly<NewMarketScheduleEditorProps>) {
  return (
    <ScheduleEditor
      {...context}
      embedded
      isNew
      memberSummary={memberSummary}
      onCancel={onBack}
      onSaved={onSaved}
      projectId={projectId}
      schedule={newEditorSchedule}
    />
  );
}
