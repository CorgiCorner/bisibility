"use client";
import { Button } from "@/components/ui/Button";
import type { TrackingWorkspaceData } from "@/lib/ai-tracking/projections/workspace";
import { useTranslations } from "next-intl";
export function TrackingTopicActions({
  topic,
  canWrite,
  onEdit,
  onPause,
  onArchive,
}: Readonly<{
  topic: TrackingWorkspaceData["topics"][number] | undefined;
  canWrite: boolean;
  onEdit: () => void;
  onPause: () => void;
  onArchive: () => void;
}>) {
  const t = useTranslations("projectAiTracking");
  if (!topic) return null;
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="xs"
        variant="ghost"
        disabled={!canWrite || topic.status === "archived"}
        onClick={onEdit}
      >
        {t("editTopic")}
      </Button>
      <Button
        size="xs"
        variant="ghost"
        disabled={!canWrite || topic.status === "archived"}
        onClick={onPause}
      >
        {topic.status === "paused" ? t("resume") : t("pause")}
      </Button>
      <Button
        size="xs"
        variant="ghost"
        disabled={!canWrite || topic.status === "archived"}
        onClick={onArchive}
      >
        {t("archive")}
      </Button>
    </div>
  );
}
