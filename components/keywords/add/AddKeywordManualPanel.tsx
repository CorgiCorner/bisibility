"use client";

import { Textarea } from "@/components/ui";
import {
  type AddKeywordDrawerForm,
  fieldClass,
  fieldLabelClass,
  fieldMetaClass,
} from "@/lib/keywords/add-keyword-drawer-shared";
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
  return (
    <>
      <div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <label className={fieldLabelClass} htmlFor="add-keywords-input">
              Keywords
            </label>
            <span className={fieldMetaClass}>Required</span>
          </div>
          <span className="font-mono text-[11px] text-fg-muted">
            {count} {count === 1 ? "keyword" : "keywords"}
          </span>
        </div>
        <Textarea
          className="mt-2 min-h-[128px]"
          id="add-keywords-input"
          placeholder={
            "One keyword per line\nOptional per line: keyword | https://example.com/page"
          }
          {...register("keywords")}
        />
        {errors.keywords ? (
          <p className="mt-2 font-mono text-[11.5px] text-red-text">{errors.keywords.message}</p>
        ) : null}
      </div>

      <div className="border-t border-border pt-4">
        <p className="m-0 font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted">
          Options below apply to all keywords
        </p>
      </div>
      {trackingControls}

      <div>
        <label className={fieldLabelClass} htmlFor="add-target-input">
          Target URL
        </label>
        <div className="mt-2 flex items-center gap-2 rounded-control border border-border-control bg-transparent px-3 transition-colors focus-within:border-accent">
          {domain ? <span className="font-mono text-[13px] text-fg-muted">{domain}</span> : null}
          <input
            className="min-w-0 flex-1 border-none bg-transparent py-2.5 font-mono text-[13px] text-fg outline-none placeholder:text-[12px] placeholder:leading-4 placeholder:text-fg-muted focus-visible:outline-none"
            id="add-target-input"
            placeholder="/page"
            {...register("targetUrl")}
          />
        </div>
        {errors.targetUrl ? (
          <p className="mt-2 font-mono text-[11.5px] text-red-text">{errors.targetUrl.message}</p>
        ) : null}
        <p className="mt-[7px] text-[11.5px] text-fg-muted">
          This URL applies to all keywords. You can overwrite it above with{" "}
          <code className="font-mono text-fg-muted">| URL</code>.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <MetadataField
          error={errors.topic}
          label="Topic"
          name="topic"
          placeholder="e.g. Product"
          register={register}
        />
        <MetadataField
          error={errors.intent}
          label="Intent"
          name="intent"
          placeholder="e.g. commercial"
          register={register}
        />
      </div>

      <div>
        <label className={fieldLabelClass} htmlFor="add-tags-input">
          Tags
        </label>
        <input
          className={`${fieldClass} mt-2`}
          id="add-tags-input"
          onChange={(event) => onTagsChange(event.target.value)}
          placeholder="Comma-separated, e.g. Product, High intent"
          value={tagsText}
        />
        {tagSuggestions.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className={fieldMetaClass}>In project</span>
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
      {error ? <p className="mt-2 font-mono text-[11.5px] text-red-text">{error.message}</p> : null}
    </div>
  );
}
