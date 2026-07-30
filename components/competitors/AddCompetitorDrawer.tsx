"use client";

import { Button, Sheet } from "@/components/ui";
import { addManagedCompetitor } from "@/lib/actions/competitors";
import {
  type AddManagedCompetitorInput,
  addManagedCompetitorSchema,
  type SuggestedCompetitor,
} from "@/lib/competitors/types";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { InfoIcon as Info, PlusIcon as Plus } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

type AddCompetitorDrawerProps = {
  canCreate: boolean;
  onClose: () => void;
  open: boolean;
  projectId: string;
  suggestions: SuggestedCompetitor[];
};

const labelClass =
  "flex flex-col gap-[7px] font-mono text-[10px] uppercase tracking-[0.5px] text-fg-faint";
const fieldClass =
  "rounded-[9px] border border-border-strong bg-bg-sunken px-[13px] py-[11px] text-[14px] font-medium text-fg outline-none focus:border-accent";

function labelFromDomain(domain: string) {
  return domain.split(".")[0] ?? domain;
}

export function AddCompetitorDrawer({
  canCreate,
  onClose,
  open,
  projectId,
  suggestions,
}: Readonly<AddCompetitorDrawerProps>) {
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setValue,
  } = useForm<AddManagedCompetitorInput>({
    defaultValues: {
      domain: "",
      label: "",
      projectId,
    },
    resolver: zodResolver(addManagedCompetitorSchema),
  });

  if (!canCreate) return null;

  function closeDrawer() {
    setActionError(null);
    reset({ domain: "", label: "", projectId });
    onClose();
  }

  function handleClose() {
    if (isSubmitting) return;
    closeDrawer();
  }

  function pickSuggestion(domain: string) {
    setValue("domain", domain, { shouldDirty: true, shouldValidate: true });
    setValue("label", labelFromDomain(domain), {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  async function save(values: AddManagedCompetitorInput) {
    setActionError(null);
    try {
      await addManagedCompetitor(values);
      closeDrawer();
      router.refresh();
    } catch (error) {
      setActionError(actionErrorMessage(error, "Competitor could not be added."));
    }
  }

  return (
    <Sheet
      footer={
        <div className="flex items-center gap-2.5">
          <Button disabled={isSubmitting} onClick={handleClose} type="button" variant="secondary">
            Cancel
          </Button>
          <Button
            className="flex-1"
            form="add-competitor-form"
            loading={isSubmitting}
            loadingLabel="Adding..."
            startIcon={<Plus aria-hidden size={14} weight="bold" />}
            type="submit"
          >
            Add competitor
          </Button>
        </div>
      }
      onClose={handleClose}
      open={open}
      title={
        <span className="block">
          {"Add competitor "}
          <span className="mt-[3px] block text-[13px] font-normal tracking-normal text-fg-muted">
            Benchmark another domain across your tracked keywords.
          </span>
        </span>
      }
    >
      <form
        aria-busy={isSubmitting}
        className="flex flex-col gap-5"
        id="add-competitor-form"
        onSubmit={handleSubmit(save)}
      >
        <input type="hidden" {...register("projectId")} />
        <label className={labelClass}>
          {"Domain "}
          <input
            className={`${fieldClass} font-mono`}
            disabled={isSubmitting}
            placeholder="competitor.example"
            {...register("domain")}
          />
          <span className="font-mono text-[10px] normal-case tracking-normal text-fg-faint">
            {errors.domain?.message ?? "Bare domains work best. We normalize https:// and www."}
          </span>
        </label>

        <label className={labelClass}>
          {"Label "}
          <input
            className={fieldClass}
            disabled={isSubmitting}
            placeholder="Example competitor"
            {...register("label")}
          />
          <span className="font-mono text-[10px] normal-case tracking-normal text-fg-faint">
            {errors.label?.message ?? "Optional. Used in the charts and head-to-head table."}
          </span>
        </label>

        <section className="overflow-hidden rounded-xl border border-border">
          <div className="bg-bg-sunken px-[15px] py-3 font-mono text-[10px] uppercase tracking-[0.5px] text-fg-faint">
            Observed in your SERPs
          </div>
          {suggestions.length > 0 ? (
            suggestions.map((suggestion) => (
              <div
                className="flex items-center gap-3 border-border-soft border-t px-[15px] py-3"
                key={suggestion.domain}
              >
                <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg bg-bg-sunken font-mono text-[11px] font-semibold text-fg-muted">
                  {suggestion.initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold">{suggestion.domain}</span>
                  <span className="block font-mono text-[10.5px] text-fg-faint">
                    {suggestion.overlap} observed keywords
                  </span>
                </span>
                <button
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border-strong bg-bg-elev px-3 py-1.5 text-xs font-semibold text-fg outline-none transition-colors hover:border-accent hover:text-accent focus-visible:border-accent focus-visible:text-accent"
                  disabled={isSubmitting}
                  onClick={() => pickSuggestion(suggestion.domain)}
                  type="button"
                >
                  <Plus aria-hidden size={12} weight="bold" />
                  Use
                </button>
              </div>
            ))
          ) : (
            <div className="border-border-soft border-t px-[15px] py-3 text-[12.5px] leading-5 text-fg-muted">
              No observed competitor domains yet. Add a bare domain manually.
            </div>
          )}
        </section>

        <div className="flex items-start gap-[9px] rounded-[11px] border border-dashed border-border-strong bg-bg-sunken px-3.5 py-3 text-xs leading-5 text-fg-muted">
          <span className="flex h-5 shrink-0 items-center">
            <Info aria-hidden className="text-accent" size={15} />
          </span>
          <span>
            Share of voice and head-to-head ranks update from completed rank checks for keywords you
            already track.
          </span>
        </div>
        {actionError ? <span className="font-mono text-[11px] text-red">{actionError}</span> : null}
      </form>
    </Sheet>
  );
}
