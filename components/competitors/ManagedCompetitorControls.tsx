"use client";

import { removeManagedCompetitor, renameManagedCompetitor } from "@/lib/actions/competitors";
import type { ManagedCompetitor, RenameManagedCompetitorInput } from "@/lib/competitors/types";
import { renameManagedCompetitorSchema } from "@/lib/competitors/types";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { actionErrorMessage } from "@/lib/ui/action-error";
import Tooltip from "@mui/material/Tooltip";
import {
  CheckIcon as Check,
  PencilSimpleIcon as PencilSimple,
  TrashIcon as Trash,
  XIcon as X,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

type ManagedCompetitorControlsProps = {
  canDelete: boolean;
  canUpdate: boolean;
  competitor: ManagedCompetitor;
  projectId: string;
};

const iconButtonClass =
  "grid h-7 w-7 place-items-center rounded-lg border border-border-strong bg-bg-elev text-fg-muted outline-none transition-colors hover:border-accent hover:text-accent-text focus-visible:border-accent focus-visible:text-accent-text disabled:opacity-50";

export function ManagedCompetitorControls({
  canDelete,
  canUpdate,
  competitor,
  projectId,
}: Readonly<ManagedCompetitorControlsProps>) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
  } = useForm<RenameManagedCompetitorInput>({
    defaultValues: {
      competitorId: competitor.id,
      label: competitor.label,
      projectId,
    },
    resolver: zodResolver(renameManagedCompetitorSchema),
  });

  function closeEdit() {
    setMessage(null);
    setIsEditing(false);
    reset({ competitorId: competitor.id, label: competitor.label, projectId });
  }

  function onRename(values: RenameManagedCompetitorInput) {
    setMessage(null);
    startTransition(() => {
      void renameManagedCompetitor(values)
        .then(() => {
          reset(values);
          setIsEditing(false);
          router.refresh();
        })
        .catch((error: unknown) =>
          setMessage(actionErrorMessage(error, "Competitor could not be updated.")),
        );
    });
  }

  function onRemove() {
    if (!confirm(`Remove ${competitor.label} from competitors?`)) {
      return;
    }
    setMessage(null);
    startTransition(() => {
      void removeManagedCompetitor({ competitorId: competitor.id, projectId })
        .then(() => router.refresh())
        .catch((error: unknown) =>
          setMessage(actionErrorMessage(error, "Competitor could not be updated.")),
        );
    });
  }

  if (isEditing) {
    return (
      <form className="flex min-w-[220px] flex-col gap-1.5" onSubmit={handleSubmit(onRename)}>
        <input type="hidden" {...register("projectId")} />
        <input type="hidden" {...register("competitorId")} />
        <span className="flex items-center gap-1.5">
          <input
            aria-label="Competitor label"
            className="h-8 min-w-0 flex-1 rounded-lg border border-border-strong bg-transparent px-2.5 text-[12.5px] font-medium text-fg outline-none focus:border-accent"
            {...register("label")}
          />
          <button
            aria-label="Save competitor label"
            className={iconButtonClass}
            disabled={isPending}
            type="submit"
          >
            <Check aria-hidden size={13} weight="bold" />
          </button>
          <button
            aria-label="Cancel rename"
            className={iconButtonClass}
            onClick={closeEdit}
            type="button"
          >
            <X aria-hidden size={13} weight="bold" />
          </button>
        </span>
        <span className="font-mono text-[10px] text-red-text">
          {errors.label?.message ?? message}
        </span>
      </form>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {canUpdate ? (
        <Tooltip title="Rename">
          <button
            aria-label={`Rename ${competitor.label}`}
            className={iconButtonClass}
            onClick={() => setIsEditing(true)}
            type="button"
          >
            <PencilSimple aria-hidden size={13} />
          </button>
        </Tooltip>
      ) : null}
      {canDelete ? (
        <Tooltip title="Remove">
          <span>
            <button
              aria-label={`Remove ${competitor.label}`}
              className={iconButtonClass}
              disabled={isPending}
              onClick={onRemove}
              type="button"
            >
              <Trash aria-hidden size={13} />
            </button>
          </span>
        </Tooltip>
      ) : null}
      {message ? <span className="font-mono text-[10px] text-red-text">{message}</span> : null}
    </span>
  );
}
