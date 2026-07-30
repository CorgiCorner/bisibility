"use client";

import { Textarea } from "@/components/ui";
import { type AddKeywordDrawerForm, fieldClass } from "@/lib/keywords/add-keyword-drawer-shared";
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
          <label className="text-[12.5px] font-semibold text-fg" htmlFor="add-keywords-input">
            Keywords
          </label>
          <span className="font-mono text-[11px] text-fg-faint">
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
        <p className="mt-[7px] text-[11.5px] text-fg-faint">
          One keyword per line. Add <code className="font-mono text-fg-muted">| URL</code> after a
          keyword to pin just that one.
        </p>
        {errors.keywords ? (
          <p className="mt-2 font-mono text-[11.5px] text-red">{errors.keywords.message}</p>
        ) : null}
      </div>

      <div className="border-t border-border pt-4">
        <p className="m-0 font-mono text-[10px] uppercase tracking-[0.5px] text-fg-faint">
          Applies to all keywords in this batch
        </p>
      </div>
      {trackingControls}

      <div>
        <div className="flex items-center gap-2">
          <label className="text-[12.5px] font-semibold text-fg" htmlFor="add-target-input">
            Target URL
          </label>
          <span className="font-mono text-[10px] uppercase tracking-[0.4px] text-fg-faint">
            Optional
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2 rounded-[9px] border border-border-strong bg-bg-sunken px-3 transition-colors focus-within:border-accent">
          {domain ? <span className="font-mono text-[13px] text-fg-faint">{domain}</span> : null}
          <input
            className="min-w-0 flex-1 border-none bg-transparent py-2.5 font-mono text-[13px] text-fg outline-none focus-visible:outline-none"
            id="add-target-input"
            placeholder="/page"
            {...register("targetUrl")}
          />
        </div>
        {errors.targetUrl ? (
          <p className="mt-2 font-mono text-[11.5px] text-red">{errors.targetUrl.message}</p>
        ) : null}
        <p className="mt-[7px] text-[11.5px] text-fg-faint">
          Pins every keyword in this batch to one page. Leave blank to auto-match the best ranking
          URL; a per-line <code className="font-mono text-fg-muted">| URL</code> overrides this pin.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <OptionalMetadataField
          error={errors.topic}
          label="Topic"
          name="topic"
          placeholder="e.g. Product"
          register={register}
        />
        <OptionalMetadataField
          error={errors.intent}
          label="Intent"
          name="intent"
          placeholder="e.g. commercial"
          register={register}
        />
      </div>

      <div>
        <label className="text-[12.5px] font-semibold text-fg" htmlFor="add-tags-input">
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
            <span className="font-mono text-[10px] uppercase tracking-[0.4px] text-fg-faint">
              Suggested
            </span>
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

function OptionalMetadataField({
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
      <div className="flex items-center gap-2">
        <label className="text-[12.5px] font-semibold text-fg" htmlFor={`add-${name}-input`}>
          {label}
        </label>
        <span className="font-mono text-[10px] uppercase tracking-[0.4px] text-fg-faint">
          Optional
        </span>
      </div>
      <input
        className={`${fieldClass} mt-2`}
        id={`add-${name}-input`}
        placeholder={placeholder}
        {...register(name)}
      />
      {error ? <p className="mt-2 font-mono text-[11.5px] text-red">{error.message}</p> : null}
    </div>
  );
}
