"use client";

import {
  actionErrorMessage,
  actionResultCount,
  type KeywordAction,
  keywordCountLabel,
  splitTagInput,
} from "@/components/keywords/action-utils";
import { Button, inputClassName, useToast } from "@/components/ui";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { type BulkKeywordTagInput, bulkKeywordTagSchema } from "@/lib/schemas/keyword";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { type BulkFormChrome, runBulkFormBusy } from "./bulk-form-chrome";

export { BulkFrequencyForm } from "./BulkFrequencyForm";

type BulkTagFormProps = BulkFormChrome & {
  action: KeywordAction<BulkKeywordTagInput>;
  onDone: () => void;
  onError: (message: string | null) => void;
  projectId: string;
  selectedIds: string[];
};

const labelClass =
  "flex flex-col gap-1.5 font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted";
const inputClass = `${inputClassName} min-h-10 rounded-control px-3 font-sans text-[13px] normal-case tracking-normal`;

const noopUndo = () => undefined;

export function BulkTagForm({
  action,
  formId,
  hideSubmit = false,
  onBusyChange,
  onDone,
  onError,
  projectId,
  selectedIds,
}: Readonly<BulkTagFormProps>) {
  const { showToast } = useToast();
  const [tagsText, setTagsText] = useState("");
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    setValue,
  } = useForm<BulkKeywordTagInput>({
    defaultValues: { keywordIds: selectedIds, projectId, tags: [] },
    resolver: zodResolver(bulkKeywordTagSchema),
  });
  const tagMessage = Array.isArray(errors.tags) ? errors.tags[0]?.message : errors.tags?.message;

  async function save(values: BulkKeywordTagInput) {
    await runBulkFormBusy(onBusyChange, async () => {
      onError(null);
      try {
        const result = await action(values);
        const count = actionResultCount(result, selectedIds.length);
        showToast(`Tagged ${keywordCountLabel(count)}`, { severity: "success", undo: noopUndo });
        onDone();
      } catch (error) {
        onError(actionErrorMessage(error));
      }
    });
  }

  return (
    <form
      className={hideSubmit ? "grid gap-3" : "flex flex-wrap items-end gap-2"}
      id={formId}
      onSubmit={handleSubmit((v) => void save(v))}
    >
      <label className={labelClass}>
        {"Tags "}
        <input
          className={inputClass}
          onChange={(event) => {
            setTagsText(event.target.value);
            setValue("tags", splitTagInput(event.target.value), {
              shouldDirty: true,
              shouldValidate: true,
            });
          }}
          placeholder="Product, High intent"
          value={tagsText}
        />
        {tagMessage ? <span className="text-red-text">{tagMessage}</span> : null}
      </label>
      {hideSubmit ? null : (
        <Button disabled={isSubmitting} size="sm" sx={{ minHeight: 40 }} type="submit">
          {isSubmitting ? "Adding..." : "Apply tag"}
        </Button>
      )}
    </form>
  );
}
