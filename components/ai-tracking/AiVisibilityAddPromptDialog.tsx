"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { Modal } from "@/components/ui/Modal";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Textarea } from "@/components/ui/Textarea";
import { type AddPromptFormValues, addPromptFormSchema } from "@/lib/ai-tracking/add-prompt-form";
import type { BrandNameSet } from "@/lib/ai-tracking/brand-name-match";
import { matchBrandNamesInAnswer } from "@/lib/ai-tracking/brand-name-match";
import {
  BULK_PROMPT_LIMIT,
  type BulkSkipReason,
  PROMPT_TEXT_LIMIT,
  parseBulkPrompts,
  promptCharacterCount,
  singlePromptIssue,
} from "@/lib/ai-tracking/bulk-prompts";
import { formatPromptUsd } from "@/lib/ai-tracking/prompt-format";
import {
  type TrackingEnginePriceCard,
  trackingPromptEngines,
  trackingSelectionEstimateFromCard,
} from "@/lib/ai-tracking/tracking-engines";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { overviewEngineCopy, overviewEngineLabel, overviewList } from "./overview-labels";

export function AiVisibilityAddPromptDialog({
  defaultMode = "one",
  defaultText = "",
  enginePrices,
  enginesHref,
  error = null,
  existingTexts,
  onClose,
  onCreate,
  onCreateTopic,
  open,
  ownNames,
  enabledEngines,
  topics,
}: Readonly<{
  defaultMode?: "bulk" | "one";
  defaultText?: string;
  enginePrices: TrackingEnginePriceCard;
  enginesHref: string;
  error?: string | null;
  existingTexts: readonly string[];
  onClose: () => void;
  onCreate: (input: {
    texts: readonly string[];
    topicId: string | null;
  }) => Promise<{ created: number; skipped: number }>;
  onCreateTopic: (name: string) => Promise<string | null>;
  open: boolean;
  ownNames: BrandNameSet | null;
  enabledEngines: readonly { engine: string; source: string }[];
  topics: readonly { id: string; name: string }[];
}>) {
  const t = useTranslations("projectAiTracking");
  const locale = useLocale();
  const engineLabels = overviewEngineCopy((key) => t(key));
  const engineNames = [
    ...new Set(enabledEngines.map((item) => overviewEngineLabel(item.engine, engineLabels))),
  ];
  const engineChoice = engineNames.length
    ? t("promptsTab.engineChoice", { engines: overviewList(locale, engineNames) })
    : t("promptsTab.engineChoiceNone");
  const engines = trackingPromptEngines();
  const [report, setReport] = useState<{ created: number; skipped: number } | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const { formState, handleSubmit, register, setValue, watch } = useForm<AddPromptFormValues>({
    defaultValues: {
      mode: defaultMode,
      text: defaultText,
      topicId: "",
      topicName: "",
    },
    resolver: zodResolver(addPromptFormSchema(existingTexts)),
  });
  const mode = watch("mode");
  const text = watch("text");
  const topicId = watch("topicId");
  const topicName = watch("topicName");
  const parsed = mode === "bulk" ? parseBulkPrompts(text, existingTexts) : null;
  const count = promptCharacterCount(text);
  const estimate = trackingSelectionEstimateFromCard(enginePrices, engines);
  const branded =
    ownNames !== null &&
    (mode === "one"
      ? text.trim().length > 0 && matchBrandNamesInAnswer(text, ownNames).named
      : text
          .split(/\r?\n/)
          .some((line) => line.trim() && matchBrandNamesInAnswer(line, ownNames).named));
  const blocked =
    formState.isSubmitting ||
    (mode === "one" ? singlePromptIssue(text) !== null : (parsed?.valid.length ?? 0) === 0) ||
    (topicId === "new" && topicName.trim().length === 0);
  async function submit(values: AddPromptFormValues) {
    setLocalError(null);
    try {
      let nextTopic = values.topicId || null;
      if (values.topicId === "new") {
        nextTopic = await onCreateTopic(values.topicName.trim());
        if (!nextTopic) return;
      }
      const bulk = values.mode === "bulk" ? parseBulkPrompts(values.text, existingTexts) : null;
      const result = await onCreate({
        texts: bulk ? bulk.valid : [values.text],
        topicId: nextTopic,
      });
      const skipped = (bulk?.skipped.length ?? 0) + result.skipped;
      if (skipped === 0) onClose();
      else setReport({ created: result.created, skipped });
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : t("couldNotSaveChanges"));
    }
  }
  return (
    <Modal
      description={t("promptsTab.helper")}
      dismissDisabled={formState.isSubmitting}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} type="button" variant="secondary">
            {t("cancel")}
          </Button>
          <Button
            disabled={blocked}
            form="ai-visibility-add-prompt"
            loading={formState.isSubmitting}
            type="submit"
          >
            {t("promptsTab.add")}
          </Button>
        </div>
      }
      onClose={onClose}
      open={open}
      size="lg"
      title={t("addPrompt")}
    >
      <form
        className="flex flex-col gap-4"
        id="ai-visibility-add-prompt"
        onSubmit={handleSubmit(submit)}
      >
        {error || localError ? (
          <p className="m-0 text-sm text-red-text" role="alert">
            {error || localError}
          </p>
        ) : null}
        {report ? (
          <p className="m-0 text-sm" role="status">
            {t("promptsTab.createdSkipped", report)}
          </p>
        ) : null}
        <SegmentedControl
          ariaLabel={t("promptsTab.addMode")}
          onChange={(value) => setValue("mode", value)}
          options={[
            { label: t("promptsTab.modeOne"), value: "one" },
            { label: t("promptsTab.modeBulk"), value: "bulk" },
          ]}
          size="field"
          value={mode}
        />
        <label
          className="flex flex-col gap-2 text-sm font-medium"
          htmlFor="ai-visibility-prompt-text"
        >
          {t("promptsTab.promptLabel")}
          <Textarea
            id="ai-visibility-prompt-text"
            placeholder={mode === "bulk" ? t("promptsTab.bulkPlaceholder") : undefined}
            rows={mode === "bulk" ? 8 : 4}
            {...register("text")}
          />
        </label>
        {mode === "one" ? (
          <p
            className={
              count > PROMPT_TEXT_LIMIT ? "m-0 text-sm text-red-text" : "m-0 text-sm text-fg-muted"
            }
          >
            {t("promptsTab.counter", { count, limit: PROMPT_TEXT_LIMIT })}
          </p>
        ) : null}
        {mode === "one" && count > PROMPT_TEXT_LIMIT ? (
          <p className="m-0 text-sm text-fg-muted">
            {t("promptsTab.tooLong", { limit: PROMPT_TEXT_LIMIT })}
          </p>
        ) : null}
        {branded ? <p className="m-0 text-sm text-fg-muted">{t("promptsTab.brandHint")}</p> : null}
        {parsed && parsed.skipped.length > 0 ? (
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm text-fg-muted">
            {parsed.skipped.map((skip) => (
              <li key={`${skip.line}-${skip.reason}`}>
                {t("promptsTab.lineIssue", { line: skip.line, reason: skipLabel(skip.reason, t) })}
              </li>
            ))}
          </ul>
        ) : null}
        <MenuSelect
          ariaLabel={t("topic")}
          onChange={(value) => setValue("topicId", value)}
          options={[
            { label: t("promptsTab.noTopic"), value: "" },
            ...topics.map((topic) => ({ label: topic.name, value: topic.id })),
            { label: t("addTopic"), value: "new" },
          ]}
          size="input"
          value={topicId}
        />
        {topicId === "new" ? (
          <Input aria-label={t("topicName")} {...register("topicName")} />
        ) : null}
        <p className="m-0 text-sm">
          <Link className="text-accent-text underline underline-offset-2" href={enginesHref}>
            {engineChoice}
          </Link>
        </p>
        {estimate !== null ? (
          <p className="m-0 text-sm text-fg-muted">
            {t("promptsTab.perRun", { cost: formatPromptUsd(estimate, locale) })}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}

function skipLabel(
  reason: BulkSkipReason,
  t: ReturnType<typeof useTranslations<"projectAiTracking">>,
) {
  if (reason === "duplicate") return t("promptsTab.skipDuplicate");
  if (reason === "empty") return t("promptsTab.skipEmpty");
  if (reason === "over_limit") return t("promptsTab.skipOverLimit", { limit: BULK_PROMPT_LIMIT });
  return t("promptsTab.skipTooLong", { limit: PROMPT_TEXT_LIMIT });
}
