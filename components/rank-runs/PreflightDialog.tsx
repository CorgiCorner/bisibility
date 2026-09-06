"use client";

import { Button, Modal, StatusChip } from "@/components/ui";
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
import { type SerpDepth, serpDepthValues } from "@/lib/serp/markets";
import { useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { PreflightOptionGroups } from "./PreflightOptionGroups";
import {
  blockCodeFor,
  decisionLine,
  type PreflightBlockCode,
  type PreflightProvider,
  type PreflightScope,
  preflightBlockPresentation,
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

function idempotencyKey() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `preflight-${Date.now()}`;
}

function isNotStarted(
  result: LaunchRankCheckRunActionResult,
): result is Extract<LaunchRankCheckRunActionResult, { status: "not_started" }> {
  return "status" in result && result.status === "not_started";
}

export function PreflightDialog({
  budgetHref,
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
  const block = blockCode ? preflightBlockPresentation[blockCode] : null;
  const disabled = Boolean(block) || refreshing || submitting;

  async function refreshPreview(next: Partial<PreflightFormInput>) {
    const input = preflightFormSchema.parse({ ...form.getValues(), ...next });
    form.setValue("depth", input.depth, { shouldValidate: true });
    form.setValue("providerId", input.providerId, { shouldValidate: true });
    const request = ++requestNumber.current;
    setPreviewError(null);
    setRefreshing(true);
    try {
      const nextPreview = await previewAction({ ...input, projectId, spec });
      if (request === requestNumber.current) {
        setActionBlock(null);
        setPreview(nextPreview);
      }
    } catch {
      if (request === requestNumber.current)
        setPreviewError("Could not update the estimate. Try again.");
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
        if (result.code === "no_provider" || result.code === "budget_exhausted") {
          setActionBlock(result.code);
        }
        setPreviewError(result.message);
        return;
      }
      if ("outcome" in result) {
        setActionBlock("duplicate");
        return;
      }
      onStarted?.(result);
      onClose();
    } catch {
      setPreviewError("Could not start this run. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const selectedDepth = form.watch("depth") ?? initialDepth;
  const selectedProvider = form.watch("providerId");
  const footer = (
    <div className="flex w-full flex-wrap items-center justify-between gap-2.5">
      <p className="m-0 min-w-0 text-[11.5px] tabular-nums text-fg-muted">
        {decisionLine(preview, leftAfterLabel)}
      </p>
      <div className="flex items-center gap-2">
        <Button disabled={submitting} onClick={onClose} type="button" variant="secondary">
          Cancel
        </Button>
        <Button
          disabled={disabled}
          form={formId}
          loading={submitting}
          loadingLabel="Starting..."
          title={block ? block.message(preview, duplicateDetail) : undefined}
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
            className="flex items-start gap-2.5 rounded-control border border-border bg-bg-sunken px-3.5 py-3"
            role="alert"
          >
            <StatusChip dot label={block.label} tone={block.tone} />
            <div className="min-w-0">
              <p className="m-0 text-[12.5px] leading-5 text-fg">
                {block.message(preview, duplicateDetail)}
              </p>
              <a
                className="mt-2 inline-block text-[11.5px] font-semibold text-fg underline-offset-3 hover:underline"
                href={actionHref(blockCode as PreflightBlockCode, {
                  budgetHref,
                  duplicateRunHref,
                  integrationsHref,
                })}
              >
                {block.cta}
              </a>
            </div>
          </div>
        ) : null}

        <section
          className="rounded-card border border-border px-4 py-[13px]"
          aria-label="Run scope"
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
