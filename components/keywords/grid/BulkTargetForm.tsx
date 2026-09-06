"use client";

import {
  actionErrorMessage,
  actionResultCount,
  type KeywordAction,
  keywordCountLabel,
} from "@/components/keywords/action-utils";
import { TargetUrlField } from "@/components/keywords/TargetUrlField";
import { Button, useToast } from "@/components/ui";
import { zodResolver } from "@/lib/forms/zod-resolver";
import type { KeywordRow } from "@/lib/queries/keywords";
import { type BulkKeywordTargetInput, bulkKeywordTargetSchema } from "@/lib/schemas/keyword";
import { useForm } from "react-hook-form";
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
        const verb = view.hasTargets ? "changed" : "set";
        showToast(`Target URL ${verb} for ${keywordCountLabel(count)}`, {
          severity: "success",
          undo: noopUndo,
        });
        onDone();
      } catch (error) {
        onError(actionErrorMessage(error));
      }
    });
  }

  return (
    <div className="grid gap-3">
      {view.mixed ? (
        <p className="m-0 text-[12px] leading-relaxed text-fg-muted">
          Selected keywords have multiple target values. Saving replaces all of them with the same
          URL.
        </p>
      ) : null}
      <form
        className={hideSubmit ? "grid gap-2" : "flex flex-col gap-2 sm:flex-row sm:items-end"}
        id={formId}
        onSubmit={handleSubmit((values) => void save(values))}
      >
        <TargetUrlField
          className="min-w-0 flex-1"
          error={errors.targetUrl?.message}
          placeholder="/features/rank-tracking"
          {...register("targetUrl")}
        />
        {hideSubmit ? null : (
          <Button
            className="w-full shrink-0 sm:w-auto sm:min-w-[140px]"
            disabled={isSubmitting || !isDirty || !isValid}
            size="sm"
            sx={{ minHeight: 40 }}
            type="submit"
          >
            {isSubmitting ? "Saving..." : view.submitLabel}
          </Button>
        )}
      </form>
      {view.hasTargets ? (
        <div className="border-t border-border pt-3">
          <Button onClick={onRequestClear} size="sm" type="button" variant="secondary">
            Clear target URL{selectedRows.length === 1 ? "" : "s"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
