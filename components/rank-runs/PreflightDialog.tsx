"use client";

import { PaymentQuoteSummary } from "@/components/action-payment/PaymentQuoteSummary";
import { usePaymentQuoteExpiry } from "@/components/action-payment/usePaymentQuoteExpiry";
import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { appPath } from "@/lib/routing/app-path";
import { presentBudgetDenial } from "@/lib/ui/action-error";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { PreflightFooter } from "./PreflightFooter";
import {
  type PreflightDialogProps,
  type PreflightFormInput,
  preflightFormSchema,
} from "./preflight-contracts";

export type { PreflightDialogProps } from "./preflight-contracts";

import { PreflightBlockNotice } from "./PreflightBlockNotice";
import { PreflightOptionGroups, PreflightScopeSummary } from "./PreflightOptionGroups";
import { PreflightOverlapNotice } from "./PreflightOverlapNotice";
import {
  blockCodeFor,
  decisionLine,
  idempotencyKey,
  isNotStarted,
  launchFailureNotice,
  type PreflightBlockCode,
} from "./preflight-presentation";

export function PreflightDialog({
  budgetHref,
  cancelRunAction,
  duplicateDetail,
  duplicateRunHref,
  initialDepth = 20,
  initialPreview,
  initialProviderId,
  integrationsHref,
  launchAction,
  leftAfterLabel,
  onClose,
  onStarted,
  open,
  projectId,
  previewAction,
  providers,
  providerFallbackNote,
  scope,
  spec,
}: Readonly<PreflightDialogProps>) {
  const errors = useSharedErrorMessages();
  const t = useTranslations("shared.rankPreflight");
  const paymentT = useTranslations("shared.actionPayment");
  const [selection] = useState(() => structuredClone(spec));
  const formId = useId();
  const form = useForm<PreflightFormInput>({
    defaultValues: {
      depth: initialDepth,
      providerId:
        initialPreview.payment?.option.providerId ?? initialProviderId ?? providers[0]?.id,
      paymentOptionId: initialPreview.payment?.option.id,
    },
    resolver: zodResolver(preflightFormSchema),
  });
  const requestNumber = useRef(0);
  const launching = useRef(false);
  const validEstimate = useRef(true);
  const launchKey = useRef<string | null>(null);
  const launchUnknown = useRef(false);
  const mismatchResigned = useRef(false);
  const [previewValid, setPreviewValid] = useState(true);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [actionBlock, setActionBlock] = useState<PreflightBlockCode | null>(null);
  const [preview, setPreview] = useState(initialPreview);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const payment = preview.payment;
  const expired = usePaymentQuoteExpiry(
    Math.min(Date.parse(preview.expiresAt), payment ? Date.parse(payment.expiresAt) : Infinity),
  );
  const blockCode = blockCodeFor(preview, actionBlock);
  const currentScope = typeof scope === "function" ? scope(preview) : scope;
  const disabled =
    !payment?.availability.allowed ||
    (expired && !unconfirmed) ||
    Boolean(blockCode) ||
    !previewValid ||
    refreshing ||
    submitting ||
    preview.targetCount === 0;

  async function refreshPreview(next: Partial<PreflightFormInput>, notice: string | null = null) {
    if (launchUnknown.current) return;
    if (notice === null) mismatchResigned.current = false;
    validEstimate.current = false;
    setPreviewValid(false);
    const input = preflightFormSchema.parse({ ...form.getValues(), ...next });
    form.setValue("paymentOptionId", input.paymentOptionId);
    form.setValue("depth", input.depth, { shouldValidate: true });
    form.setValue("providerId", input.providerId, { shouldValidate: true });
    const request = ++requestNumber.current;
    setPreviewError(notice);
    setRefreshing(true);
    try {
      const nextPreview = await previewAction({ ...input, projectId, spec: selection });
      if (request === requestNumber.current) {
        setActionBlock(null);
        setPreview(nextPreview);
        validEstimate.current = true;
        setPreviewValid(true);
      }
    } catch {
      if (request === requestNumber.current) setPreviewError(t("couldNotRefresh"));
    } finally {
      if (request === requestNumber.current) setRefreshing(false);
    }
  }

  async function start(input: PreflightFormInput) {
    if (
      launching.current ||
      !validEstimate.current ||
      disabled ||
      !payment ||
      (!launchUnknown.current && Date.parse(payment.expiresAt) <= Date.now())
    )
      return;
    launching.current = true;
    launchKey.current ??= idempotencyKey();
    setSubmitting(true);
    setPreviewError(null);
    try {
      const result = await launchAction({
        ...input,
        acceptedPayment: { quoteToken: payment.quoteToken },
        paymentOptionId: payment.option.id,
        providerId: payment.option.providerId,
        idempotencyKey: launchKey.current,
        previewToken: preview.previewToken,
        projectId,
        spec: selection,
      });
      launchUnknown.current = false;
      setUnconfirmed(false);
      if (isNotStarted(result)) {
        launchKey.current = null;
        const notice = launchFailureNotice(result.code, mismatchResigned.current);
        if (notice.kind === "resign") {
          await refreshPreview({}, t("previewChanged"));
          mismatchResigned.current = notice.mismatch;
          return;
        }
        mismatchResigned.current = false;
        if (notice.kind === "payment") {
          setPreviewError(t("paymentUnavailable"));
          return;
        }
        if (notice.kind === "block") setActionBlock(notice.code);
        setPreviewError(notice.kind === "sample" ? t("sampleProject") : t("couldNotStart"));
        return;
      }
      if ("outcome" in result) {
        launchKey.current = null;
        if (result.reason === "already_in_progress") setActionBlock("duplicate");
        else {
          validEstimate.current = false;
          setPreviewValid(false);
          setPreviewError(
            t(result.reason === "market_inactive" ? "marketInactive" : "keywordsArchived"),
          );
        }
        return;
      }
      onStarted?.(result);
      onClose();
    } catch {
      launchUnknown.current = true;
      setUnconfirmed(true);
      setPreviewError(t("startUnconfirmed"));
    } finally {
      launching.current = false;
      setSubmitting(false);
    }
  }

  const selectedDepth = form.watch("depth") ?? initialDepth;
  const selectedProvider = form.watch("providerId");
  const footer = (
    <PreflightFooter
      decision={decisionLine(
        preview,
        presentBudgetDenial(preview.budget.reason, errors, t("budgetBlocked")),
        leftAfterLabel,
      )}
      disabled={disabled}
      expired={expired && !unconfirmed}
      formId={formId}
      label={currentScope.startLabel}
      onClose={onClose}
      onRefresh={() => void refreshPreview({})}
      payment={payment}
      submitting={submitting || refreshing}
    />
  );

  return (
    <Modal
      contentClassName="px-5.5 py-4.5"
      footer={footer}
      onClose={() => {
        if (!launching.current) onClose();
      }}
      open={open}
      title={
        <>
          <span className="block">{currentScope.title}</span>
          <span className="mt-1.5 block text-[12.5px] font-normal tracking-normal text-fg-muted">
            {currentScope.subtitle}
          </span>
        </>
      }
      width={520}
    >
      <form className="grid gap-4" id={formId} onSubmit={form.handleSubmit(start)}>
        <PreflightBlockNotice
          code={blockCode}
          duplicateDetail={duplicateDetail}
          budgetHref={budgetHref}
          duplicateRunHref={duplicateRunHref}
          integrationsHref={integrationsHref}
          policyHref={`${appPath(projectId, "settings", "tracking")}#measurement-policy`}
        />

        {preview.overlaps.length > 0 ? (
          <PreflightOverlapNotice
            cancelAction={cancelRunAction}
            disabled={refreshing || submitting || unconfirmed}
            onCancelled={() => refreshPreview({})}
            overlapRunCount={preview.overlapRunCount}
            overlaps={preview.overlaps}
            projectId={projectId}
          />
        ) : null}

        <PreflightScopeSummary scope={currentScope} />

        <PaymentQuoteSummary
          quote={refreshing ? undefined : payment}
          options={preview.paymentOptions}
          disabled={refreshing || submitting || unconfirmed}
          onOptionChange={(option) =>
            void refreshPreview({ providerId: option.providerId, paymentOptionId: option.id })
          }
        />
        {expired ? (
          <p role="alert" className="m-0 text-xs text-warning">
            {paymentT("expired")}
          </p>
        ) : null}
        <PreflightOptionGroups
          disabled={refreshing || submitting || unconfirmed}
          onDepthChange={(depth) => refreshPreview({ depth })}
          onProviderChange={(providerId) =>
            refreshPreview({ providerId, paymentOptionId: undefined })
          }
          providerFallbackNote={providerFallbackNote}
          providers={preview.paymentOptions?.length ? [] : providers}
          selectedDepth={selectedDepth}
          selectedProvider={selectedProvider}
        />

        {preview.targetCount === 0 ? (
          <p className="m-0 text-[12px] text-fg-muted" role="status">
            {t("nothingToCheck")}
          </p>
        ) : null}
        {!previewValid && !refreshing ? (
          <Button onClick={() => refreshPreview({})} type="button" variant="secondary">
            {t("refreshEstimate")}
          </Button>
        ) : null}
        {previewError ? (
          <p className="m-0 text-[12px] leading-5 text-red-text" role="alert">
            {previewError}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
