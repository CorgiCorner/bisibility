"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/toast-context";
import type { ActivePageSnapshot, TakePageSnapshotResult } from "@/lib/pages/snapshot-view";
import { useTranslations } from "next-intl";
import { useState } from "react";

/**
 * Saves the active comparison snapshot. The label stays the same before and
 * after the first snapshot; saving again asks to confirm because the new one
 * becomes the baseline and the current one is archived, not deleted.
 */
export function ProjectPagesSnapshotButton({
  canWrite,
  onTaken,
  projectId,
  snapshot,
  take,
}: Readonly<{
  canWrite: boolean;
  onTaken: (snapshot: ActivePageSnapshot) => void;
  projectId: string;
  snapshot: ActivePageSnapshot | null;
  take: (input: { confirm?: boolean; projectId: string }) => Promise<TakePageSnapshotResult>;
}>) {
  const t = useTranslations("projectPages");
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function save(confirm: boolean) {
    setPending(true);
    try {
      const result = await take({ confirm, projectId });
      if (result.status === "needs_confirmation") {
        setOpen(true);
        return;
      }
      if (result.status === "taken") {
        setOpen(false);
        showToast(t("snapshot.taken", { count: result.snapshot.pageCount }), {
          severity: "success",
        });
        onTaken(result.snapshot);
        return;
      }
      showToast(t("snapshot.failed"), { severity: "error" });
    } catch {
      showToast(t("snapshot.failed"), { severity: "error" });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button
        disabled={!canWrite || pending}
        onClick={() => (snapshot ? setOpen(true) : void save(false))}
        size="sm"
        type="button"
        variant="outline"
      >
        {t("snapshot.button")}
      </Button>
      <Modal
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setOpen(false)} type="button" variant="ghost">
              {t("snapshot.cancel")}
            </Button>
            <Button
              disabled={pending}
              onClick={() => void save(true)}
              type="button"
              variant="primary"
            >
              {t("snapshot.replace")}
            </Button>
          </div>
        }
        onClose={() => setOpen(false)}
        open={open}
        title={t("snapshot.confirmTitle")}
      >
        <p className="m-0 text-ui-caption text-fg-muted">{t("snapshot.confirmBody")}</p>
      </Modal>
    </>
  );
}
