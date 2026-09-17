"use client";

import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { presentSafeActionError } from "@/components/keywords/safe-action-error";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
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
  const t = useTranslations("projectCompetitors.ui");
  const sharedErrors = useSharedErrorMessages();
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
      setError(presentSafeActionError(cause, sharedErrors, t("removeError")));
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
      title={t("removeCompetitorTitle")}
      onClose={close}
      size="sm"
      footer={
        <>
          <Button disabled={busy} onClick={close} size="sm" variant="secondary">
            {t("cancel")}
          </Button>
          <Button loading={busy} onClick={() => void remove()} size="sm" variant="destructive">
            {t("remove")}
          </Button>
        </>
      }
    >
      <p className="m-0 text-[13px] leading-6 text-fg-muted">
        {t.rich("removeCompetitorDescription", {
          domain: competitor.domain,
          strong: (chunks: ReactNode) => <strong className="break-all text-fg">{chunks}</strong>,
        })}
      </p>
      {error ? (
        <p className="mb-0 text-[12px] text-red-text" role="alert">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
