"use client";

import { Button } from "@/components/ui/Button";
import { InlineToken } from "@/components/ui/InlineToken";
import { Input } from "@/components/ui/Input";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Textarea } from "@/components/ui/Textarea";
import { type TagPageRuleKind, tagPageRuleKinds } from "@/lib/pages/tag-pattern";
import type { ProjectPageTagOption } from "@/lib/pages/tag-view";
import type { PageTagFormValues } from "@/lib/schemas/page-tag";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Controller, type UseFormReturn } from "react-hook-form";

export function PageTagRuleFields({
  addExclude,
  canWrite,
  errorText,
  excludeDraft,
  form,
  initialName,
  onExclude,
  options,
  publish,
  setExcludeDraft,
  sitemaps,
  values,
}: Readonly<{
  addExclude: () => void;
  canWrite: boolean;
  errorText: (message: string | undefined) => string | null;
  excludeDraft: string;
  form: UseFormReturn<PageTagFormValues>;
  initialName: string;
  onExclude: (patterns: string[]) => void;
  options: readonly ProjectPageTagOption[];
  publish: (patch: Partial<PageTagFormValues>) => void;
  setExcludeDraft: (value: string) => void;
  sitemaps: readonly string[];
  values: PageTagFormValues;
}>) {
  const t = useTranslations("projectPages");
  const tagFieldId = useId();
  const named = options.find((option) => option.name === values.tagName.trim());
  return (
    <>
      <label className="flex flex-col gap-1" htmlFor={tagFieldId}>
        <span className="text-ui-caption text-fg">{t("drawer.tag")}</span>
        <Input
          aria-invalid={Boolean(form.formState.errors.tagName)}
          id={tagFieldId}
          disabled={!canWrite || initialName.length > 0}
          {...form.register("tagName", { onChange: () => publish({}) })}
        />
        <span className="text-ui-caption text-fg-muted">{t("drawer.tagHint")}</span>
        {named ? (
          <span className="text-ui-caption text-fg-muted">
            {t("drawer.keywordHint", { count: named.keywordCount, name: named.name })}
          </span>
        ) : null}
        {errorText(form.formState.errors.tagName?.message) ? (
          <span className="text-ui-caption text-red-text" role="alert">
            {errorText(form.formState.errors.tagName?.message)}
          </span>
        ) : null}
        {values.tagName.trim() && !initialName ? (
          <span className="flex flex-wrap gap-1">
            {options
              .filter((option) =>
                option.name.toLowerCase().includes(values.tagName.trim().toLowerCase()),
              )
              .slice(0, 6)
              .map((option) => (
                <Button
                  key={option.id}
                  onClick={() => form.setValue("tagName", option.name, { shouldValidate: true })}
                  size="input"
                  type="button"
                  variant="outline"
                >
                  {option.name}
                </Button>
              ))}
          </span>
        ) : null}
      </label>
      <Controller
        control={form.control}
        name="kind"
        render={({ field }) => (
          <SegmentedControl
            ariaLabel={t("drawer.rule")}
            label={<span className="text-ui-caption text-fg">{t("drawer.rule")}</span>}
            onChange={(kind) => {
              field.onChange(kind);
              publish({ kind });
            }}
            options={tagPageRuleKinds.map((kind) => ({
              label: t(`byTag.kind.${kind}`),
              value: kind,
            }))}
            size="field"
            value={field.value}
          />
        )}
      />
      <RuleKindFields
        canWrite={canWrite}
        errorText={errorText}
        form={form}
        kind={values.kind}
        publish={publish}
        sitemaps={sitemaps}
        sitemapUrl={values.sitemapUrl}
      />
      {values.kind === "manual" ? null : (
        <div className="flex flex-col gap-2">
          <span className="text-ui-caption text-fg">{t("drawer.exclude")}</span>
          <div className="flex flex-wrap gap-1">
            {values.excludePatterns.map((pattern) => (
              <InlineToken
                dismissLabel={t("drawer.excludeRemove", { pattern })}
                key={pattern}
                onDismiss={() =>
                  onExclude(values.excludePatterns.filter((item) => item !== pattern))
                }
                value={pattern}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              aria-label={t("drawer.exclude")}
              disabled={!canWrite}
              onChange={(event) => setExcludeDraft(event.target.value)}
              placeholder={t("drawer.excludePlaceholder")}
              value={excludeDraft}
            />
            <Button
              size="input"
              disabled={!canWrite}
              onClick={addExclude}
              type="button"
              variant="outline"
            >
              {t("drawer.excludeAdd")}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

function RuleKindFields({
  canWrite,
  errorText,
  form,
  kind,
  publish,
  sitemaps,
  sitemapUrl,
}: Readonly<{
  canWrite: boolean;
  errorText: (message: string | undefined) => string | null;
  form: UseFormReturn<PageTagFormValues>;
  kind: TagPageRuleKind;
  publish: (patch: Partial<PageTagFormValues>) => void;
  sitemaps: readonly string[];
  sitemapUrl: string;
}>) {
  const t = useTranslations("projectPages");
  const patternFieldId = useId();
  const urlsFieldId = useId();
  if (kind === "path_pattern") {
    return (
      <label className="flex flex-col gap-1" htmlFor={patternFieldId}>
        <span className="text-ui-caption text-fg">{t("drawer.pattern")}</span>
        <Input
          disabled={!canWrite}
          id={patternFieldId}
          {...form.register("pattern", {
            onChange: (event) => publish({ pattern: event.target.value }),
          })}
        />
        <span className="text-ui-caption text-fg-muted">{t("drawer.patternHint")}</span>
        {errorText(form.formState.errors.pattern?.message) ? (
          <span className="text-ui-caption text-red-text" role="alert">
            {errorText(form.formState.errors.pattern?.message)}
          </span>
        ) : null}
      </label>
    );
  }
  if (kind === "sitemap") {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-ui-caption text-fg">{t("drawer.sitemap")}</span>
        {sitemaps.length === 0 ? (
          <p className="m-0 text-ui-caption text-fg-muted">{t("drawer.sitemapEmpty")}</p>
        ) : (
          <MenuSelect
            ariaLabel={t("drawer.sitemap")}
            onChange={(next) => {
              form.setValue("sitemapUrl", next, { shouldValidate: true });
              publish({ sitemapUrl: next });
            }}
            options={[
              { label: t("drawer.sitemapChoose"), value: "" },
              ...sitemaps.map((url) => ({ label: url, value: url })),
            ]}
            size="input"
            value={sitemapUrl}
          />
        )}
      </div>
    );
  }
  if (kind === "url_list") {
    return (
      <label className="flex flex-col gap-1" htmlFor={urlsFieldId}>
        <span className="text-ui-caption text-fg">{t("drawer.urls")}</span>
        <Textarea
          disabled={!canWrite}
          id={urlsFieldId}
          placeholder={t("drawer.urlsPlaceholder")}
          {...form.register("urlsText", {
            onChange: (event) => publish({ urlsText: event.target.value }),
          })}
        />
      </label>
    );
  }
  return <p className="m-0 text-ui-caption text-fg-muted">{t("drawer.handNote")}</p>;
}
