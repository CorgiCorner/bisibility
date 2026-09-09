"use client";

import { Button } from "@/components/ui/Button";
import { RowActionsMenu } from "@/components/ui/RowActionsMenu";
import { useToast } from "@/components/ui/toast-context";
import { useRouter } from "next/navigation";
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
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.detail ?? `Could not ${action} the schedule. Please try again.`);
  }
}

export function RestoreScheduleButton({
  projectId,
  scheduleId,
}: Readonly<{ projectId: string; scheduleId: string }>) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  async function restore() {
    setPending(true);
    try {
      await scheduleLifecycleRequest(projectId, scheduleId, "restore");
      showToast("Schedule restored as paused. Add keywords and resume when ready.", {
        severity: "success",
      });
      router.refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not restore the schedule.", {
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
      loadingLabel="Restoring..."
      onClick={() => void restore()}
    >
      Restore
    </Button>
  );
}

export function ScheduleArchiveMenu({
  name,
  onArchive,
}: Readonly<{ name: string; onArchive: () => void }>) {
  return (
    <RowActionsMenu
      ariaLabel={`Actions for ${name}`}
      items={[{ label: "Archive", onSelect: onArchive }]}
    />
  );
}
