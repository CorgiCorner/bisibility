"use client";

import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { actionResultCount, type KeywordAction } from "@/components/keywords/action-utils";
import { TargetUrlField } from "@/components/keywords/TargetUrlField";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/toast-context";
import { zodResolver } from "@/lib/forms/zod-resolver";
import type { KeywordRow } from "@/lib/queries/keywords";
import { type BulkKeywordTargetInput, bulkKeywordTargetSchema } from "@/lib/schemas/keyword";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { presentBulkActionError } from "./bulk-action-error";
import { type BulkFormChrome, runBulkFormBusy } from "./bulk-form-chrome";
import { bulkTargetView } from "./bulk-target-model";

type BulkTargetFormProps = BulkFormChrome & {
  action: KeywordAction<BulkKeywordTargetInput>;
  onDone: () => void;
  onError: (message: string | null) => void;
  onRequestClear: () => void;
  projectId: string;
  selectedRows: KeywordRow[];
};

const noopUndo = () => undefined;

export function BulkTargetForm({
  action,
  formId,
  hideSubmit = false,
  onBusyChange,
  onDone,
  onError,
  onRequestClear,
  projectId,
  selectedRows,
}: Readonly<BulkTargetFormProps>) {
  const { showToast } = useToast();
  const t = useTranslations("projectRankTracker.keywordImport.management.bulk");
  const sharedErrors = useSharedErrorMessages();
  const view = bulkTargetView(selectedRows);
  const selectedIds = selectedRows.map((row) => row.id);
  const {
    formState: { errors, isDirty, isSubmitting, isValid },
    handleSubmit,
    register,
  } = useForm<BulkKeywordTargetInput>({
    defaultValues: { keywordIds: selectedIds, projectId, targetUrl: view.initialValue },
    mode: "onChange",
    resolver: zodResolver(bulkKeywordTargetSchema),
  });

  async function save(values: BulkKeywordTargetInput) {
    await runBulkFormBusy(onBusyChange, async () => {
      onError(null);
      try {
        const result = await action(values);
        const count = actionResultCount(result, selectedIds.length);
        showToast(view.hasTargets ? t("targetChanged", { count }) : t("targetSet", { count }), {
          severity: "success",
          undo: noopUndo,
        });
        onDone();
      } catch (error) {
        onError(presentBulkActionError(error, sharedErrors, t("actionFailed")));
      }
    });
  }

  return (
    <div className="grid gap-3">
      {view.mixed ? (
        <p className="m-0 text-[12px] leading-relaxed text-fg-muted">{t("targetMixed")}</p>
      ) : null}
      <form
        className={hideSubmit ? "grid gap-2" : "flex flex-col gap-2 sm:flex-row sm:items-end"}
        id={formId}
        onSubmit={handleSubmit((values) => void save(values))}
      >
        <TargetUrlField
          className="min-w-0 flex-1"
          error={errors.targetUrl ? t("targetInvalid") : undefined}
          help={t("targetHelp")}
          label={t("targetUrl")}
          placeholder={t("targetPlaceholder")}
          {...register("targetUrl")}
        />
        {hideSubmit ? null : (
          <Button
            className="w-full shrink-0 sm:w-auto sm:min-w-[140px]"
            disabled={isSubmitting || !isDirty || !isValid}
            size="sm"
            style={{ minHeight: 40 }}
            type="submit"
          >
            {isSubmitting ? t("saving") : t(view.submitKey)}
          </Button>
        )}
      </form>
      {view.hasTargets ? (
        <div className="border-t border-border pt-3">
          <Button onClick={onRequestClear} size="sm" type="button" variant="secondary">
            {t("clearTarget", { count: selectedRows.length })}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
