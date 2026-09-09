"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export type RemoveCompetitorAction = (input: {
  competitorId: string;
  projectId: string;
}) => Promise<unknown>;

export function RemoveCompetitorDialog({
  competitor,
  onClose,
  projectId,
  removeCompetitor,
}: Readonly<{
  competitor: { domain: string; publicId: string };
  onClose: () => void;
  projectId: string;
  removeCompetitor: RemoveCompetitorAction;
}>) {
  const router = useRouter();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function remove() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await removeCompetitor({ competitorId: competitor.publicId, projectId });
      onClose();
      router.refresh();
    } catch (cause) {
      setError(actionErrorMessage(cause, "Competitor could not be removed."));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  function close() {
    if (!pending.current) onClose();
  }
  return (
    <Modal
      open
      title="Remove competitor"
      onClose={close}
      size="sm"
      footer={
        <>
          <Button disabled={busy} onClick={close} size="sm" variant="secondary">
            Cancel
          </Button>
          <Button loading={busy} onClick={() => void remove()} size="sm" variant="destructive">
            Remove
          </Button>
        </>
      }
    >
      <p className="m-0 text-[13px] leading-6 text-fg-muted">
        Remove <strong className="break-all text-fg">{competitor.domain}</strong> from this project?
        Its aliases and market settings will also be removed. Saved rank checks and SERP results are
        kept.
      </p>
      {error ? (
        <p className="mb-0 text-[12px] text-red-text" role="alert">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
