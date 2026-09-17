"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { OperationRow } from "@/components/ui/OperationRow";
import { useTranslations } from "next-intl";
import type { RunPageData } from "./RunPageTypes";

type RunPageCancelDialogProps = {
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
  run: RunPageData;
};

export function RunPageCancelDialog({
  busy,
  onClose,
  onConfirm,
  open,
  run,
}: Readonly<RunPageCancelDialogProps>) {
  const t = useTranslations("projectRuns.rankRuns");
  const completed = run.counts.completed;
  const sent = Math.max(
    run.counts.total -
      run.counts.cancelled -
      run.counts.completed -
      run.counts.deferred -
      run.counts.failed,
    0,
  );

  return (
    <Modal
      footer={
        <>
          <Button disabled={busy} onClick={onClose} size="sm" variant="ghost">
            {t("keepRun")}
          </Button>
          <Button
            loading={busy}
            loadingLabel={t("cancelling")}
            onClick={onConfirm}
            size="sm"
            variant="destructive"
          >
            {t("cancelRun")}
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      size="md"
      title={t("cancelDialog.title")}
    >
      <div className="grid gap-4 text-[12.5px] leading-[1.55] text-fg">
        <p className="m-0 text-pretty">{t("cancelDialog.body")}</p>
        <ol className="m-0 grid list-decimal gap-2 pl-5 text-fg-muted">
          <li>{t("cancelDialog.unsentStop")}</li>
          <li>{t("cancelDialog.providerFinishes")}</li>
          <li>{t("cancelDialog.completedKept")}</li>
        </ol>
        <OperationRow
          action=""
          actor={null}
          completed={completed}
          counts={null}
          deferred={run.counts.deferred}
          etaSeconds={null}
          failed={run.counts.failed}
          href={null}
          meta={t("targets", { count: run.counts.total })}
          nextCheckAt={null}
          now={null}
          provider={null}
          resumeDate={null}
          showBar
          state="cancelling"
          stateLine={t("cancelDialog.stateLine", { count: sent })}
          status={null}
          title={t("cancelDialog.outcome")}
          total={run.counts.total}
          unit="targets"
          variant="modal"
        />
      </div>
    </Modal>
  );
}
