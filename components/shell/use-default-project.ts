"use client";

import { useToast } from "@/components/ui/toast-context";
import { setDefaultProject } from "@/lib/actions/default-project";
import type { WorkspaceSummary } from "@/lib/queries/workspaces";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

type PendingDefault = { base: string | null; value: string | null };

/**
 * Optimistic default-project state for the switcher. The pending choice is keyed to the saved
 * value it was made against, so once the refreshed server value arrives it takes over without an
 * effect; a failed save drops the pending choice and the saved value shows again.
 */
export function useDefaultProject(workspaces: readonly WorkspaceSummary[]) {
  const t = useTranslations("shell.workspace.defaultProject");
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState<PendingDefault | null>(null);
  const latestRequest = useRef(0);
  const savedId = workspaces.find((workspace) => workspace.isDefault)?.id ?? null;
  const defaultProjectId = pending?.base === savedId ? pending.value : savedId;

  async function toggleDefault(projectId: string) {
    const next = defaultProjectId === projectId ? null : projectId;
    latestRequest.current += 1;
    const request = latestRequest.current;
    setPending({ base: savedId, value: next });
    const saved = await setDefaultProject({ projectId: next }).then(
      (result) => result.ok,
      () => false,
    );
    // A newer click owns the optimistic state; its own response settles it.
    if (request !== latestRequest.current) return;
    if (!saved) {
      setPending(null);
      showToast(t("error"), { severity: "error" });
    }
    router.refresh();
  }

  return { defaultProjectId, toggleDefault };
}
