"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

type ConfirmCompetitorsManualFormProps = Readonly<{
  addManualCompetitor: (input: unknown) => Promise<unknown>;
  onClose: () => void;
  onCancel: () => void;
  cancelLabel: string;
  projectId: string;
}>;

const manualCompetitorFormSchema = z.object({
  aliases: z.string(),
  domain: z.string().trim().min(1, "Enter a domain."),
});

type ManualCompetitorForm = z.infer<typeof manualCompetitorFormSchema>;

function aliasesFromInput(value: string) {
  return value
    .split(",")
    .map((alias) => alias.trim())
    .filter(Boolean);
}

export function ConfirmCompetitorsManualForm({
  addManualCompetitor,
  onClose,
  onCancel,
  cancelLabel,
  projectId,
}: ConfirmCompetitorsManualFormProps) {
  const [actionError, setActionError] = useState<string | null>(null);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<ManualCompetitorForm>({
    defaultValues: { aliases: "", domain: "" },
    resolver: zodResolver(manualCompetitorFormSchema),
  });

  async function saveManualCompetitor(values: ManualCompetitorForm) {
    setActionError(null);
    const parsed = manualCompetitorFormSchema.safeParse(values);
    if (!parsed.success) {
      setActionError(parsed.error.issues[0]?.message ?? "Enter a valid competitor domain.");
      return;
    }
    try {
      await addManualCompetitor({
        aliases: aliasesFromInput(parsed.data.aliases),
        domain: parsed.data.domain,
        projectId,
      });
      onClose();
    } catch (error) {
      setActionError(actionErrorMessage(error, "Competitor could not be added."));
    }
  }

  return (
    <form className="grid gap-3" onSubmit={handleSubmit(saveManualCompetitor)}>
      <label className="grid gap-1.5 text-[12px] font-semibold text-fg" htmlFor="competitor-domain">
        Domain
        <Input
          disabled={isSubmitting}
          id="competitor-domain"
          placeholder="competitor.example.org"
          {...register("domain")}
        />
        {errors.domain ? <span className="text-red-text">{errors.domain.message}</span> : null}
      </label>
      <label
        className="grid gap-1.5 text-[12px] font-semibold text-fg"
        htmlFor="competitor-aliases"
      >
        Brand aliases (optional)
        <Input
          disabled={isSubmitting}
          id="competitor-aliases"
          placeholder="Brand names, comma separated"
          {...register("aliases")}
        />
        <span className="text-[11px] font-normal leading-5 text-fg-muted">
          Other brand names to match in citations, separated by commas.
        </span>
      </label>
      <div className="mt-1 flex justify-end gap-2">
        <Button
          disabled={isSubmitting}
          onClick={onCancel}
          size="sm"
          type="button"
          variant="secondary"
        >
          {cancelLabel}
        </Button>
        <Button disabled={isSubmitting} size="sm" type="submit">
          {isSubmitting ? "Adding..." : "Add competitor"}
        </Button>
      </div>
      {actionError ? (
        <p role="alert" className="text-[12px] text-red-text">
          {actionError}
        </p>
      ) : null}
    </form>
  );
}
