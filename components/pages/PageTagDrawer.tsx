"use client";

import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { Switch } from "@/components/ui/Switch";
import { zodResolver } from "@/lib/forms/zod-resolver";
import type { TagPageRuleKind } from "@/lib/pages/tag-pattern";
import { splitTagRuleLines, tagPatternCode } from "@/lib/pages/tag-pattern";
import type { ProjectPageTagOption } from "@/lib/pages/tag-view";
import {
  emptyPageTagForm,
  type PageTagFormValues,
  pageTagFormSchema,
} from "@/lib/schemas/page-tag";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { PageTagRuleFields } from "./PageTagRuleFields";

const pageTagResolver = zodResolver(pageTagFormSchema);

export type PageTagPreview = {
  sample: readonly string[];
  total: number;
  truncated: boolean;
};

export type PageTagDraft = {
  excludePatterns: string[];
  kind: TagPageRuleKind;
  pattern: string;
  sitemapUrl: string;
  urls: string[];
};

export function PageTagDrawer({
  canWrite,
  initial = emptyPageTagForm,
  onClose,
  open,
  options,
  preview,
  previewDelayMs = 300,
  save,
  sitemaps,
  title,
}: Readonly<{
  canWrite: boolean;
  initial?: PageTagFormValues;
  onClose: () => void;
  open: boolean;
  options: readonly ProjectPageTagOption[];
  preview: (draft: PageTagDraft) => Promise<PageTagPreview>;
  previewDelayMs?: number;
  save: (values: PageTagFormValues) => Promise<void>;
  sitemaps: readonly string[];
  title: string;
}>) {
  const t = useTranslations("projectPages");
  const formId = useId();
  const generation = useRef(0);
  const armed = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [excludeDraft, setExcludeDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [previewState, setPreviewState] = useState<PageTagPreview | null>(null);
  const form = useForm<PageTagFormValues>({ defaultValues: initial, resolver: pageTagResolver });
  const values = form.watch();

  function errorText(message: string | undefined) {
    if (!message) return null;
    const known = [
      "exclude_invalid",
      "invalid_url",
      "must_start_with_slash",
      "required",
      "sitemap_required",
      "tag_required",
      "too_long",
      "too_many_urls",
      "too_many_wildcards",
    ] as const;
    const code = known.find((item) => item === message);
    return code ? t(`drawer.errors.${code}`) : message;
  }

  function schedule(next: PageTagFormValues) {
    if (timer.current) clearTimeout(timer.current);
    const current = ++generation.current;
    if (next.kind === "path_pattern" && tagPatternCode(next.pattern)) {
      setPreviewState(null);
      return;
    }
    const run = () => {
      void preview({
        excludePatterns: next.excludePatterns,
        kind: next.kind,
        pattern: next.pattern,
        sitemapUrl: next.sitemapUrl,
        urls: splitTagRuleLines(next.urlsText),
      })
        .then((result) => {
          if (generation.current !== current) return;
          setPreviewState(result);
          setPreviewError(false);
        })
        .catch(() => {
          if (generation.current === current) setPreviewError(true);
        });
    };
    if (previewDelayMs === 0) run();
    else timer.current = setTimeout(run, previewDelayMs);
  }

  function publish(patch: Partial<PageTagFormValues>) {
    const next = { ...form.getValues(), ...patch };
    schedule(next);
  }

  function addExclude() {
    const code = tagPatternCode(excludeDraft);
    if (code) {
      setNotice(errorText(code === "required" ? "exclude_invalid" : code));
      return;
    }
    const pattern = excludeDraft.trim();
    if (values.excludePatterns.includes(pattern)) return;
    const excludePatterns = [...values.excludePatterns, pattern];
    form.setValue("excludePatterns", excludePatterns, { shouldDirty: true, shouldValidate: true });
    setExcludeDraft("");
    setNotice(null);
    publish({ excludePatterns });
  }

  async function onSubmit(input: PageTagFormValues) {
    if (!canWrite || pending) return;
    setPending(true);
    setNotice(null);
    try {
      await save(input);
      onClose();
    } catch {
      setNotice(t("drawer.saveFailed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} type="button" variant="ghost">
            {t("drawer.cancel")}
          </Button>
          <Button disabled={!canWrite || pending} form={formId} type="submit" variant="primary">
            {t("drawer.save")}
          </Button>
        </div>
      }
      onClose={onClose}
      open={open}
      title={title}
    >
      <form
        className="flex flex-col gap-4"
        id={formId}
        onSubmit={form.handleSubmit(onSubmit)}
        ref={(node) => {
          if (!node || armed.current) return;
          armed.current = true;
          schedule(form.getValues());
        }}
      >
        <PageTagRuleFields
          addExclude={addExclude}
          canWrite={canWrite}
          errorText={errorText}
          excludeDraft={excludeDraft}
          form={form}
          initialName={initial.tagName}
          onExclude={(excludePatterns) => {
            form.setValue("excludePatterns", excludePatterns, { shouldValidate: true });
            publish({ excludePatterns });
          }}
          options={options}
          publish={publish}
          setExcludeDraft={setExcludeDraft}
          sitemaps={sitemaps}
          values={values}
        />
        <p aria-live="polite" className="m-0 text-ui-caption text-fg">
          {previewError
            ? t("drawer.previewFailed")
            : previewState
              ? t("drawer.preview", { count: previewState.total })
              : null}
        </p>
        {previewState && previewState.sample.length > 0 ? (
          <ul className="m-0 list-none p-0 text-ui-caption text-fg-muted">
            {previewState.sample.map((path) => (
              <li key={path}>{path}</li>
            ))}
            {previewState.truncated ? (
              <li>
                {t("drawer.previewMore", {
                  count: previewState.total - previewState.sample.length,
                })}
              </li>
            ) : null}
          </ul>
        ) : null}
        <Controller
          control={form.control}
          name="autoJoin"
          render={({ field }) => (
            <Switch
              checked={field.value}
              disabled={!canWrite}
              label={t("drawer.autoJoin")}
              onChange={(event) => {
                field.onChange(event.currentTarget.checked);
                publish({ autoJoin: event.currentTarget.checked });
              }}
            />
          )}
        />
        <Controller
          control={form.control}
          name="tagTargetingKeywords"
          render={({ field }) => (
            <Switch
              checked={field.value}
              disabled={!canWrite}
              label={t("drawer.tagKeywords")}
              onChange={(event) => field.onChange(event.currentTarget.checked)}
            />
          )}
        />
        {notice ? (
          <p className="m-0 text-ui-caption text-red-text" role="alert">
            {notice}
          </p>
        ) : null}
      </form>
    </Sheet>
  );
}
