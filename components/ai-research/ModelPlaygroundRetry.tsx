import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { ModelPlaygroundCopy } from "@/lib/model-playground/composer-copy";
import type { ModelPlaygroundController } from "./useModelPlayground";

export function ModelPlaygroundRetry({
  controller: h,
  copy,
}: Readonly<{ controller: ModelPlaygroundController; copy: ModelPlaygroundCopy }>) {
  return (
    <Modal
      open={h.confirmationOpen}
      onClose={h.cancelRetry}
      onPrimaryAction={h.confirmRetry}
      primaryActionDisabled={!h.canLaunch}
      title={copy.retryTitle}
      size="sm"
      footer={
        <>
          <Button size="input" variant="outline" onClick={h.cancelRetry}>
            {copy.cancel}
          </Button>
          <Button size="input" disabled={!h.canLaunch} onClick={h.confirmRetry}>
            {copy.retryRun}
          </Button>
        </>
      }
    >
      <p className="m-0 text-ui-body text-fg-muted">{copy.retryNotice}</p>
    </Modal>
  );
}
