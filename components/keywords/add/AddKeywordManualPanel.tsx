"use client";

import { Textarea } from "@/components/ui/Textarea";
import {
  type AddKeywordDrawerForm,
  fieldClass,
  fieldLabelClass,
  fieldMetaClass,
} from "@/lib/keywords/add-keyword-drawer-shared";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { FieldErrors, UseFormRegister } from "react-hook-form";

type AddKeywordManualPanelProps = {
  count: number;
  domain?: string;
  errors: FieldErrors<AddKeywordDrawerForm>;
  onAppendTag: (tag: string) => void;
  onTagsChange: (value: string) => void;
  register: UseFormRegister<AddKeywordDrawerForm>;
  tagSuggestions: readonly string[];
  tagsText: string;
  trackingControls?: ReactNode;
};

export function AddKeywordManualPanel({
  count,
  domain,
  errors,
  onAppendTag,
  onTagsChange,
  register,
  tagSuggestions,
  tagsText,
  trackingControls,
}: Readonly<AddKeywordManualPanelProps>) {
  const t = useTranslations("projectRankTracker.keywordImport.management.add");
  return (
    <>
      <div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <label className={fieldLabelClass} htmlFor="add-keywords-input">
              {t("keywords")}
            </label>
            <span className={fieldMetaClass}>{t("required")}</span>
          </div>
          <span className="font-sans tabular-nums text-[11px] text-fg-muted">
            {t("keywordCount", { count })}
          </span>
        </div>
        <Textarea
          className="mt-2 min-h-[128px]"
          id="add-keywords-input"
          placeholder={t("keywordPlaceholder")}
          {...register("keywords")}
        />
        {errors.keywords ? (
          <p className="mt-2 font-sans tabular-nums text-[11.5px] text-red-text">
            {errors.keywords.message}
          </p>
        ) : null}
      </div>

      <div className="border-t border-border pt-4">
        <p className="m-0 font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted">
          {t("optionsApply")}
        </p>
      </div>
      {trackingControls}

      <div>
        <label className={fieldLabelClass} htmlFor="add-target-input">
          {t("targetUrl")}
        </label>
        <div className="mt-2 flex items-center gap-2 rounded-control border border-border-control bg-transparent px-3 transition-colors focus-within:border-accent">
          {domain ? (
            <span className="font-sans tabular-nums text-[13px] text-fg-muted">{domain}</span>
          ) : null}
          <input
            className="min-w-0 flex-1 border-none bg-transparent py-2.5 font-sans tabular-nums text-[13px] text-fg outline-none placeholder:text-[12px] placeholder:leading-4 placeholder:text-fg-muted focus-visible:outline-none"
            id="add-target-input"
            placeholder={t("targetPathPlaceholder")}
            {...register("targetUrl")}
          />
        </div>
        {errors.targetUrl ? (
          <p className="mt-2 font-sans tabular-nums text-[11.5px] text-red-text">
            {errors.targetUrl.message}
          </p>
        ) : null}
        <p className="mt-[7px] text-[11.5px] text-fg-muted">{t("targetHint")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <MetadataField
          error={errors.topic}
          label={t("topic")}
          name="topic"
          placeholder={t("topicPlaceholder")}
          register={register}
        />
        <MetadataField
          error={errors.intent}
          label={t("intent")}
          name="intent"
          placeholder={t("intentPlaceholder")}
          register={register}
        />
      </div>

      <div>
        <label className={fieldLabelClass} htmlFor="add-tags-input">
          {t("tags")}
        </label>
        <input
          className={`${fieldClass} mt-2`}
          id="add-tags-input"
          onChange={(event) => onTagsChange(event.target.value)}
          placeholder={t("tagsPlaceholder")}
          value={tagsText}
        />
        {tagSuggestions.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className={fieldMetaClass}>{t("inProject")}</span>
            {tagSuggestions.map((tag) => (
              <button
                className="rounded-full bg-bg-sunken px-2.5 py-1 text-[11.5px] text-fg-muted"
                key={tag}
                onClick={() => onAppendTag(tag)}
                type="button"
              >
                {tag}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </>
  );
}

function MetadataField({
  error,
  label,
  name,
  placeholder,
  register,
}: Readonly<{
  error?: { message?: string };
  label: string;
  name: "intent" | "topic";
  placeholder: string;
  register: UseFormRegister<AddKeywordDrawerForm>;
}>) {
  return (
    <div>
      <label className={fieldLabelClass} htmlFor={`add-${name}-input`}>
        {label}
      </label>
      <input
        className={`${fieldClass} mt-2`}
        id={`add-${name}-input`}
        placeholder={placeholder}
        {...register(name)}
      />
      {error ? (
        <p className="mt-2 font-sans tabular-nums text-[11.5px] text-red-text">{error.message}</p>
      ) : null}
    </div>
  );
}
