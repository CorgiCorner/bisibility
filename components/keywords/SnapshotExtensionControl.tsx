"use client";

import { ActionPaymentModal } from "@/components/action-payment/ActionPaymentModal";
import { ActionPaymentPrice } from "@/components/action-payment/ActionPaymentPrice";
import { PaymentChargeLine } from "@/components/action-payment/PaymentChargeLine";
import { useActionPaymentReview } from "@/components/action-payment/useActionPaymentReview";
import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { Button } from "@/components/ui/Button";
import type { ActionPaymentReceipt } from "@/lib/action-payment/contract";
import type {
  ExtendSnapshotAction,
  PreviewSnapshotExtensionAction,
  SnapshotExtensionView,
} from "@/lib/serp/snapshot-extension";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { snapshotExtensionPaymentAction } from "./snapshot-extension-payment";

export function SnapshotExtensionControl({
  checkId,
  projectRef,
  extension,
  action,
  previewAction,
  onReload,
  formatDateTime,
}: Readonly<{
  checkId: string;
  projectRef: string;
  extension: SnapshotExtensionView;
  action?: ExtendSnapshotAction;
  previewAction?: PreviewSnapshotExtensionAction;
  onReload: () => Promise<SnapshotExtensionView | void>;
  formatDateTime: (value: string) => string;
}>) {
  const t = useTranslations("projectRankTracker.keywordDetail.results.extension");
  const { readOnly, readOnlyReason } = useProjectWriteMode();
  const paymentT = useTranslations("shared.actionPayment");
  const review = useActionPaymentReview();
  const [pending, setPending] = useState(false);
  const [lastPayment, setLastPayment] = useState<ActionPaymentReceipt>();
  const [uncertainStart, setUncertainStart] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const uncertain =
    uncertainStart !== null &&
    (extension.reason === "available" || extension.reason === "not_sent") &&
    (extension.nextStart === null || extension.nextStart <= uncertainStart);
  const deadline = extension.expiresAt ? Date.parse(extension.expiresAt) : Number.NaN;
  const windowOpen = Number.isFinite(deadline) && Date.now() < deadline;
  const expired = extension.expiresAt !== null && !windowOpen;
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
    not_sent: windowOpen
      ? t("notSent", { time: formatDateTime(extension.expiresAt!) })
      : t("notSentExpired"),
  };
  const available =
    (reason === "available" || (reason === "not_sent" && windowOpen)) &&
    Boolean(action && previewAction) &&
    !readOnly &&
    !uncertain;
  const start = extension.nextStart ?? 0;
  const input = { projectId: projectRef, checkId, nextStart: start };
  const reviewedAction =
    action && previewAction ? snapshotExtensionPaymentAction(previewAction, action, input) : null;

  function acceptReadProof(fresh: SnapshotExtensionView | void) {
    const verified = Boolean(
      fresh &&
        fresh.reason === "not_sent" &&
        fresh.nextStart === start &&
        fresh.expiresAt === extension.expiresAt,
    );
    if (verified) setUncertainStart(null);
    return verified;
  }

  async function confirm() {
    if (!available || !reviewedAction || inFlight.current) return;
    if (!extension.expiresAt || Date.now() >= Date.parse(extension.expiresAt)) {
      setError(t("expired"));
      return;
    }
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await review.request(
        reviewedAction,
        input,
        t("range", { start: start + 1, end: start + 10 }),
      );
      if (!result || "estimate" in result) return;
      if (result.payment) setLastPayment(result.payment);
      const fresh = await onReload();
      const verifiedNotSent = acceptReadProof(fresh);
      if (!result.ok) {
        if (result.reason === "failed" && !verifiedNotSent) setUncertainStart(start);
        setError(
          verifiedNotSent
            ? messages.not_sent
            : result.reason in messages
              ? messages[result.reason as keyof typeof messages]
              : paymentT(result.reason === "payment_quote_expired" ? "expired" : "unavailable"),
        );
      }
    } catch {
      setUncertainStart(start);
      setError(t("failed"));
      const fresh = await onReload().catch(() => undefined);
      if (acceptReadProof(fresh)) setError(messages.not_sent);
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
      acceptReadProof(await onReload());
      setError(null);
    } catch {
      setError(t("unavailable"));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <div className="my-4 w-full rounded-card border border-border-control bg-bg-sunken p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-60">
          <p className="m-0 text-[13px] font-semibold text-fg">{t("title")}</p>
          <p
            className="m-0 mt-1 text-[12px] leading-5 text-fg-muted"
            role={["failed", "running", "not_sent"].includes(reason) ? "status" : undefined}
          >
            {reason === "available" && extension.expiresAt
              ? t("window", { time: formatDateTime(extension.expiresAt) })
              : messages[reason]}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={pending}
            onClick={reload}
            size="sm"
            title={t("refreshHint")}
            variant="outline"
          >
            {t("refresh")}
          </Button>
          {["available", "running", "failed", "not_sent"].includes(reason) && action ? (
            <Button
              disabled={!available || pending}
              onClick={() => {
                setError(null);
                void confirm();
              }}
              size="sm"
              title={readOnlyReason ?? (!available ? messages[reason] : undefined)}
              variant="primary"
            >
              {t(reason === "not_sent" ? "retry" : "action")}
              {available && reviewedAction ? (
                <ActionPaymentPrice action={reviewedAction} input={input} />
              ) : null}
            </Button>
          ) : null}
        </div>
      </div>
      {(lastPayment ?? extension.payment) ? (
        <div className="mt-2 grid gap-1">
          <span className="text-xs text-fg-muted">{t("lastCharge")}</span>
          <PaymentChargeLine payment={lastPayment ?? extension.payment} />
        </div>
      ) : null}
      {error && !review.draft ? (
        <p className="mb-0 mt-2 text-[12px] text-red-text" role="alert">
          {error}
        </p>
      ) : null}
      <ActionPaymentModal review={review}>
        <p className="m-0 text-xs leading-5 text-fg-muted">{t("timing")}</p>
        <p className="m-0 rounded-control border border-border bg-bg-sunken p-3 text-xs leading-5">
          {t("duplicates")}
        </p>
      </ActionPaymentModal>
    </div>
  );
}
