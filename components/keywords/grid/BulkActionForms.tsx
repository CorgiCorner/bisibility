"use client";

import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import {
  actionResultCount,
  type KeywordAction,
  splitTagInput,
} from "@/components/keywords/action-utils";
import { Button } from "@/components/ui/Button";
import { inputClassName } from "@/components/ui/input-styles";
import { useToast } from "@/components/ui/toast-context";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { type BulkKeywordTagInput, bulkKeywordTagSchema } from "@/lib/schemas/keyword";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { presentBulkActionError } from "./bulk-action-error";
import { type BulkFormChrome, runBulkFormBusy } from "./bulk-form-chrome";

type BulkTagFormProps = BulkFormChrome & {
  action: KeywordAction<BulkKeywordTagInput>;
  onDone: () => void;
  onError: (message: string | null) => void;
  projectId: string;
  selectedIds: string[];
};

const labelClass =
  "flex flex-col gap-1.5 font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted";
const inputClass = `${inputClassName} min-h-10 rounded-control px-3 font-sans tabular-nums text-[13px] normal-case tracking-normal`;

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
  const t = useTranslations("projectRankTracker.keywordImport.management.bulk");
  const sharedErrors = useSharedErrorMessages();
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
        showToast(t("tagged", { count }), { severity: "success", undo: noopUndo });
        onDone();
      } catch (error) {
        onError(presentBulkActionError(error, sharedErrors, t("actionFailed")));
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
        {t("tagField")}
        <input
          className={inputClass}
          onChange={(event) => {
            setTagsText(event.target.value);
            setValue("tags", splitTagInput(event.target.value), {
              shouldDirty: true,
              shouldValidate: true,
            });
          }}
          placeholder={t("tagPlaceholder")}
          value={tagsText}
        />
        {tagMessage ? <span className="text-red-text">{t("tagInvalid")}</span> : null}
      </label>
      {hideSubmit ? null : (
        <Button disabled={isSubmitting} size="sm" style={{ minHeight: 40 }} type="submit">
          {isSubmitting ? t("adding") : t("applyTag")}
        </Button>
      )}
    </form>
  );
}
