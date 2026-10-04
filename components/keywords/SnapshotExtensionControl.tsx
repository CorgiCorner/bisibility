"use client";

import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { ExtendSnapshotAction, SnapshotExtensionView } from "@/lib/serp/snapshot-extension";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

export function SnapshotExtensionControl({
  checkId,
  projectRef,
  extension,
  action,
  onReload,
  formatDateTime,
}: Readonly<{
  checkId: string;
  projectRef: string;
  extension: SnapshotExtensionView;
  action?: ExtendSnapshotAction;
  onReload: () => Promise<void>;
  formatDateTime: (value: string) => string;
}>) {
  const t = useTranslations("projectRankTracker.keywordDetail.results.extension");
  const { readOnly, readOnlyReason } = useProjectWriteMode();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const expired = extension.expiresAt !== null && Date.now() >= Date.parse(extension.expiresAt);
  const reason = uncertain
    ? "failed"
    : extension.reason === "available" && expired
      ? "expired"
      : extension.reason;
  const messages = {
    unsupported: t("unsupported"),
    legacy: t("legacy"),
    expired: t("expired"),
    complete: t("complete"),
    running: t("running"),
    failed: t("failed"),
    disconnected: t("disconnected"),
    unavailable: t("unavailable"),
    available: t("unavailable"),
  };
  const available = reason === "available" && Boolean(action) && !readOnly && !uncertain;
  const start = extension.nextStart ?? 0;

  async function confirm() {
    if (!available || !action || inFlight.current) return;
    if (!extension.expiresAt || Date.now() >= Date.parse(extension.expiresAt)) {
      setError(t("expired"));
      return;
    }
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await action({ projectId: projectRef, checkId, nextStart: start });
      await onReload();
      if (result.ok) setOpen(false);
      else setError(messages[result.reason]);
    } catch {
      setUncertain(true);
      setError(t("failed"));
      await onReload().catch(() => undefined);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  async function reload() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    try {
      await onReload();
      setUncertain(false);
      setError(null);
    } catch {
      setError(t("unavailable"));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <div className="border-b border-border bg-bg-sunken px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-60">
          <p className="m-0 text-[13px] font-semibold text-fg">{t("title")}</p>
          <p className="m-0 mt-1 text-[12px] leading-5 text-fg-muted">
            {reason === "available" && extension.expiresAt
              ? t("window", { time: formatDateTime(extension.expiresAt) })
              : messages[reason]}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={pending} onClick={reload} size="sm" variant="secondary">
            {t("refresh")}
          </Button>
          {reason === "available" && action ? (
            <Button
              disabled={readOnly || pending}
              onClick={() => {
                setError(null);
                setOpen(true);
              }}
              size="sm"
              title={readOnlyReason ?? undefined}
              variant="secondary"
            >
              {t("action")}
            </Button>
          ) : null}
        </div>
      </div>
      {error && !open ? (
        <p className="mb-0 mt-2 text-[12px] text-red-text" role="alert">
          {error}
        </p>
      ) : null}
      <Modal
        open={open}
        onClose={() => {
          if (!inFlight.current) setOpen(false);
        }}
        title={t("confirmTitle")}
        size="sm"
        headerDivider
        footer={
          <>
            <Button disabled={pending} onClick={() => setOpen(false)} variant="secondary">
              {t("cancel")}
            </Button>
            <Button
              disabled={!available}
              loading={pending}
              loadingLabel={t("pending")}
              onClick={confirm}
            >
              {t("confirm")}
            </Button>
          </>
        }
      >
        <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-[13px]">
          <dt className="text-fg-muted">{t("rangeLabel")}</dt>
          <dd className="m-0 font-semibold">{t("range", { start: start + 1, end: start + 10 })}</dd>
          <dt className="text-fg-muted">{t("costLabel")}</dt>
          <dd className="m-0 font-semibold">{t("cost")}</dd>
        </dl>
        <p className="mb-0 mt-4 text-[13px] leading-5 text-fg-muted">{t("timing")}</p>
        <p className="mb-0 mt-3 rounded-control border border-border bg-bg-sunken p-3 text-[13px] leading-5 text-fg">
          {t("duplicates")}
        </p>
        {error ? (
          <p className="mb-0 mt-3 text-[13px] text-red-text" role="alert">
            {error}
          </p>
        ) : null}
      </Modal>
    </div>
  );
}
