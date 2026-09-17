"use client";

import { Button } from "@/components/ui/Button";
import { RowActionsMenu } from "@/components/ui/RowActionsMenu";
import { useToast } from "@/components/ui/toast-context";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

export async function scheduleLifecycleRequest(
  projectId: string,
  scheduleId: string,
  action: "archive" | "restore",
  extra: object = {},
) {
  const response = await fetch(`/api/check-schedules/${scheduleId}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, ...extra }),
  });
  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as { detail?: unknown } | null;
    if (typeof problem?.detail === "string") {
      throw new Error(problem.detail);
    }
    throw new Error("schedule_lifecycle_failed");
  }
}

export function RestoreScheduleButton({
  projectId,
  scheduleId,
}: Readonly<{ projectId: string; scheduleId: string }>) {
  const t = useTranslations("projectRuns.schedules");
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  async function restore() {
    setPending(true);
    try {
      await scheduleLifecycleRequest(projectId, scheduleId, "restore");
      showToast(t("lifecycle.restored"), {
        severity: "success",
      });
      router.refresh();
    } catch {
      showToast(t("lifecycle.restoreFailed"), {
        severity: "error",
      });
    } finally {
      setPending(false);
    }
  }
  return (
    <Button
      size="xs"
      variant="secondary"
      loading={pending}
      loadingLabel={t("lifecycle.restoring")}
      onClick={() => void restore()}
    >
      {t("lifecycle.restore")}
    </Button>
  );
}

export function ScheduleArchiveMenu({
  name,
  onArchive,
}: Readonly<{ name: string; onArchive: () => void }>) {
  const t = useTranslations("projectRuns.schedules");
  return (
    <RowActionsMenu
      ariaLabel={t("lifecycle.archiveActions", { name })}
      items={[{ label: t("lifecycle.archive"), onSelect: onArchive }]}
    />
  );
}
