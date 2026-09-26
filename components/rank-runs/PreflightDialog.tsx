"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { StatusChip } from "@/components/ui/StatusChip";
import type {
  LaunchRankCheckRunActionInput,
  LaunchRankCheckRunActionResult,
} from "@/lib/actions/rank-check-run-launch-result";
import type {
  PreviewRankCheckRunActionInput,
  PreviewRankCheckRunActionResult,
} from "@/lib/actions/rank-check-run-preview-result";
import { zodResolver } from "@/lib/forms/zod-resolver";
import type { RankCheckRunPreview } from "@/lib/rank-check/runs/preview";
import type { RunSelectionSpec } from "@/lib/rank-check/runs/selection";
import { type SerpDepth, serpDepthValues } from "@/lib/serp/constants";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { PreflightOptionGroups } from "./PreflightOptionGroups";
import { type CancelOverlappingRunAction, PreflightOverlapNotice } from "./PreflightOverlapNotice";
import {
  blockCodeFor,
  decisionLine,
  idempotencyKey,
  isNotStarted,
  type PreflightBlockCode,
  type PreflightProvider,
  type PreflightScope,
} from "./preflight-presentation";

const preflightFormSchema = z
  .object({
    depth: z.union(serpDepthValues.map((depth) => z.literal(depth))).optional(),
    providerId: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

type PreflightFormInput = z.infer<typeof preflightFormSchema>;

type PreflightActions = {
  launchAction: (input: LaunchRankCheckRunActionInput) => Promise<LaunchRankCheckRunActionResult>;
  previewAction: (
    input: PreviewRankCheckRunActionInput,
  ) => Promise<PreviewRankCheckRunActionResult>;
};

export type PreflightDialogProps = PreflightActions & {
  budgetHref: string;
  cancelRunAction?: CancelOverlappingRunAction;
  duplicateDetail?: string;
  duplicateRunHref: string;
  initialDepth?: SerpDepth;
  initialPreview: RankCheckRunPreview;
  initialProviderId?: string;
  integrationsHref: string;
  leftAfterLabel?: string;
  onClose: () => void;
  onStarted?: (result: Exclude<LaunchRankCheckRunActionResult, { status: "not_started" }>) => void;
  open: boolean;
  projectId: PreviewRankCheckRunActionInput["projectId"];
  providers: readonly PreflightProvider[];
  providerFallbackNote?: string;
  scope: PreflightScope;
  spec: RunSelectionSpec;
};

function actionHref(
  code: PreflightBlockCode,
  links: Pick<PreflightDialogProps, "budgetHref" | "duplicateRunHref" | "integrationsHref">,
) {
  if (code === "budget_exhausted") return links.budgetHref;
  if (code === "duplicate") return links.duplicateRunHref;
  return links.integrationsHref;
}

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
  const t = useTranslations("shared.rankPreflight");
  const formId = useId();
  const form = useForm<PreflightFormInput>({
    defaultValues: {
      depth: initialDepth,
      providerId: initialProviderId ?? providers[0]?.id,
    },
    resolver: zodResolver(preflightFormSchema),
  });
  const requestNumber = useRef(0);
  const [actionBlock, setActionBlock] = useState<PreflightBlockCode | null>(null);
  const [preview, setPreview] = useState(initialPreview);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const blockCode = blockCodeFor(preview, actionBlock);
  const block = blockCode
    ? {
        budget_exhausted: {
          cta: t("editBudget"),
          label: t("budget"),
          message: t("budgetBlocked"),
          tone: "attention" as const,
        },
        duplicate: {
          cta: t("openRun"),
          label: t("runInProgress"),
          message: duplicateDetail ?? t("duplicate"),
          tone: "attention" as const,
        },
        no_provider: {
          cta: t("openIntegrations"),
          label: t("noProvider"),
          message: t("noProviderBlocked"),
          tone: "critical" as const,
        },
      }[blockCode]
    : null;
  const disabled = Boolean(block) || refreshing || submitting;

  async function refreshPreview(next: Partial<PreflightFormInput>, notice: string | null = null) {
    const input = preflightFormSchema.parse({ ...form.getValues(), ...next });
    form.setValue("depth", input.depth, { shouldValidate: true });
    form.setValue("providerId", input.providerId, { shouldValidate: true });
    const request = ++requestNumber.current;
    setPreviewError(notice);
    setRefreshing(true);
    try {
      const nextPreview = await previewAction({ ...input, projectId, spec });
      if (request === requestNumber.current) {
        setActionBlock(null);
        setPreview(nextPreview);
      }
    } catch {
      if (request === requestNumber.current) setPreviewError(t("couldNotRefresh"));
    } finally {
      if (request === requestNumber.current) setRefreshing(false);
    }
  }

  async function start(input: PreflightFormInput) {
    if (block) return;
    setSubmitting(true);
    setPreviewError(null);
    try {
      const result = await launchAction({
        ...input,
        idempotencyKey: idempotencyKey(),
        previewToken: preview.previewToken,
        projectId,
        spec,
      });
      if (isNotStarted(result)) {
        if (result.code === "preview_expired" || result.code === "preview_mismatch") {
          // Re-sign the current estimate so the next start can succeed without reopening.
          await refreshPreview({}, t("previewChanged"));
          return;
        }
        if (result.code === "no_provider" || result.code === "budget_exhausted") {
          setActionBlock(result.code);
        }
        setPreviewError(result.code === "sample_project" ? t("sampleProject") : t("couldNotStart"));
        return;
      }
      if ("outcome" in result) {
        setActionBlock("duplicate");
        return;
      }
      onStarted?.(result);
      onClose();
    } catch {
      setPreviewError(t("couldNotStart"));
    } finally {
      setSubmitting(false);
    }
  }

  const selectedDepth = form.watch("depth") ?? initialDepth;
  const selectedProvider = form.watch("providerId");
  const footer = (
    <div className="flex w-full flex-wrap items-center justify-between gap-2.5">
      <p className="m-0 min-w-0 text-[11.5px] tabular-nums text-fg-muted">
        {decisionLine(preview, t("budgetBlocked"), leftAfterLabel)}
      </p>
      <div className="flex items-center gap-2">
        <Button disabled={submitting} onClick={onClose} type="button" variant="secondary">
          {t("cancel")}
        </Button>
        <Button
          disabled={disabled}
          form={formId}
          loading={submitting}
          loadingLabel={t("starting")}
          title={block?.message}
          type="submit"
        >
          {scope.startLabel}
        </Button>
      </div>
    </div>
  );

  return (
    <Modal
      contentClassName="px-5.5 py-4.5"
      footer={footer}
      onClose={onClose}
      open={open}
      title={
        <>
          <span className="block">{scope.title}</span>
          <span className="mt-1.5 block text-[12.5px] font-normal tracking-normal text-fg-muted">
            {scope.subtitle}
          </span>
        </>
      }
      width={520}
    >
      <form className="grid gap-4" id={formId} onSubmit={form.handleSubmit(start)}>
        {block ? (
          <div
            className="flex items-center gap-3 rounded-control border border-border bg-bg-sunken px-3.5 py-3"
            role="alert"
          >
            <div className="grid min-w-0 flex-1 justify-items-start gap-1.5">
              <StatusChip dot label={block.label} tone={block.tone} />
              <p className="m-0 text-[12.5px] leading-5 text-fg">{block.message}</p>
            </div>
            <Button
              className="shrink-0"
              href={actionHref(blockCode as PreflightBlockCode, {
                budgetHref,
                duplicateRunHref,
                integrationsHref,
              })}
              size="sm"
              variant="secondary"
            >
              {block.cta}
            </Button>
          </div>
        ) : null}

        {preview.overlaps.length > 0 ? (
          <PreflightOverlapNotice
            cancelAction={cancelRunAction}
            disabled={refreshing || submitting}
            onCancelled={() => refreshPreview({})}
            overlapRunCount={preview.overlapRunCount}
            overlaps={preview.overlaps}
            projectId={projectId}
          />
        ) : null}

        <section
          className="rounded-card border border-border px-4 py-[13px]"
          aria-label={t("runScope")}
        >
          <p className="m-0 text-[13.5px] font-semibold tabular-nums text-fg">{scope.equation}</p>
          <p className="m-0 mt-1 text-[11.5px] leading-[1.55] text-fg-muted">{scope.description}</p>
        </section>

        <PreflightOptionGroups
          disabled={refreshing || submitting}
          onDepthChange={(depth) => refreshPreview({ depth })}
          onProviderChange={(providerId) => refreshPreview({ providerId })}
          providerFallbackNote={providerFallbackNote}
          providers={providers}
          selectedDepth={selectedDepth}
          selectedProvider={selectedProvider}
        />

        {previewError ? (
          <p className="m-0 text-[12px] leading-5 text-red-text" role="alert">
            {previewError}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
