"use client";

import { SettingsField } from "@/components/settings/shell/settings-field-widths";
import { Button, FieldLabel, Input, Modal } from "@/components/ui";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { type UsageBudgetInput, usageBudgetSchema } from "@/lib/schemas/usage-settings";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { useState } from "react";
import { useForm } from "react-hook-form";

export type UpdateUsageBudget = (input: UsageBudgetInput) => Promise<{ capCents: number }>;

type BudgetEditModalProps = {
  capCents: number;
  onClose: () => void;
  onSaved: (capCents: number) => void;
  projectId: string;
  updateBudget: UpdateUsageBudget;
};

export function BudgetEditModal({
  capCents,
  onClose,
  onSaved,
  projectId,
  updateBudget,
}: Readonly<BudgetEditModalProps>) {
  const [actionError, setActionError] = useState<string | null>(null);
  const form = useForm<UsageBudgetInput>({
    defaultValues: { budgetDollars: (capCents / 100).toFixed(2), projectId },
    mode: "onChange",
    resolver: zodResolver(usageBudgetSchema),
  });

  async function submit(values: UsageBudgetInput) {
    setActionError(null);
    try {
      const result = await updateBudget(values);
      onSaved(result.capCents);
    } catch (error) {
      setActionError(actionErrorMessage(error, "Monthly budget could not be saved."));
    }
  }

  return (
    <Modal
      footer={
        <>
          <Button disabled={form.formState.isSubmitting} onClick={onClose} variant="secondary">
            Cancel
          </Button>
          <Button
            disabled={!form.formState.isValid}
            form="usage-budget-form"
            loading={form.formState.isSubmitting}
            loadingLabel="Saving"
            type="submit"
          >
            Save budget
          </Button>
        </>
      }
      footerClassName="gap-2.5"
      onClose={onClose}
      open
      title="Edit budget"
      width={400}
    >
      <form id="usage-budget-form" onSubmit={form.handleSubmit(submit)}>
        <p className="m-0 text-[12.5px] leading-[1.55] text-fg-muted">
          Monthly cap for all recorded provider spend in this project. Checks and research pause
          when the cap is reached.
        </p>
        <SettingsField className="mt-4" width="sm">
          <FieldLabel htmlFor="usage-budget-dollars" label="Monthly budget in dollars" />
          <div className="relative mt-1.5">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-mono text-[13px] text-fg-muted">
              $
            </span>
            <Input
              {...form.register("budgetDollars")}
              className="pl-7 font-mono tabular-nums"
              id="usage-budget-dollars"
              inputMode="decimal"
            />
          </div>
        </SettingsField>
        {form.formState.errors.budgetDollars ? (
          <p className="m-0 mt-2 text-[11.5px] text-red-text">
            {form.formState.errors.budgetDollars.message}
          </p>
        ) : null}
        {actionError ? <p className="m-0 mt-2 text-[11.5px] text-red-text">{actionError}</p> : null}
        <p className="m-0 mt-3 text-[11.5px] text-fg-muted">
          Changes are authorized on the server and recorded in the audit log.
        </p>
      </form>
    </Modal>
  );
}
