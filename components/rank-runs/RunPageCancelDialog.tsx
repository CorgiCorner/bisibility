"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { OperationRow } from "@/components/ui/OperationRow";
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
            Keep run
          </Button>
          <Button
            loading={busy}
            loadingLabel="Cancelling"
            onClick={onConfirm}
            size="sm"
            variant="destructive"
          >
            Cancel run
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      size="md"
      title="Cancel this run?"
    >
      <div className="grid gap-4 text-[12.5px] leading-[1.55] text-fg">
        <p className="m-0 text-pretty">
          Cancelling changes only this run. It does not change the schedule or remove completed
          results.
        </p>
        <ol className="m-0 grid list-decimal gap-2 pl-5 text-fg-muted">
          <li>Targets that have not been sent stop immediately.</li>
          <li>Targets already with the provider finish and are billed.</li>
          <li>Completed targets and their results are kept.</li>
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
          meta={`${run.counts.total.toLocaleString("en-US")} targets`}
          nextCheckAt={null}
          now={null}
          provider={null}
          resumeDate={null}
          showBar
          state="cancelling"
          stateLine={`${sent.toLocaleString("en-US")} targets may still be with the provider.`}
          status={null}
          title="Cancellation outcome"
          total={run.counts.total}
          unit="targets"
          variant="modal"
        />
      </div>
    </Modal>
  );
}
