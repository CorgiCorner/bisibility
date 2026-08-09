"use client";

import { inputClassName } from "@/components/ui";
import { type ActionResult, unwrapActionResult } from "@/lib/actions/action-result";
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
import { z } from "zod";

const tagNameSchema = z.string().trim().min(1, "Tag name is required.").max(48);
const renameTagFormSchema = z
  .object({
    fromName: tagNameSchema,
    projectId: z.string().trim().min(1).max(120),
    toName: tagNameSchema,
  })
  .refine((data) => data.fromName !== data.toName, {
    message: "Choose a different tag name.",
    path: ["toName"],
  });

type RenameTagForm = z.infer<typeof renameTagFormSchema>;

export type RenameTagAction = (
  input: RenameTagForm,
) => Promise<ActionResult<{ merged: boolean; renamed: number }>>;
export type DeleteTagAction = (input: {
  name: string;
  projectId: string;
}) => Promise<ActionResult<{ deleted: number }>>;

export type TagManagementControlsProps = {
  deleteTag?: DeleteTagAction;
  projectId: string;
  renameTag?: RenameTagAction;
  tag: { count: number; label: string };
};

const iconButtonClass =
  "grid h-8 w-8 place-items-center rounded-lg border border-border-strong bg-bg-elev text-fg-muted outline-none transition-colors hover:border-accent hover:text-accent-text focus-visible:border-accent focus-visible:text-accent-text disabled:cursor-not-allowed disabled:opacity-50";
const inputClass = `${inputClassName} h-8 min-w-0 flex-1 rounded-lg px-2.5 text-[12.5px] font-medium`;

function errorMessage(error: unknown, fallback: string) {
  return actionErrorMessage(error, fallback);
}

export function TagManagementControls({
  deleteTag,
  projectId,
  renameTag,
  tag,
}: Readonly<TagManagementControlsProps>) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
  } = useForm<RenameTagForm>({
    defaultValues: { fromName: tag.label, projectId, toName: tag.label },
    mode: "onChange",
    resolver: zodResolver(renameTagFormSchema),
  });

  function closeEdit() {
    setIsEditing(false);
    setMessage(null);
    reset({ fromName: tag.label, projectId, toName: tag.label });
  }

  function onRename(values: RenameTagForm) {
    if (!renameTag) return;
    setMessage(null);
    startTransition(() => {
      void renameTag(values)
        .then(unwrapActionResult)
        .then((result) => {
          reset({ fromName: values.toName, projectId, toName: values.toName });
          setIsEditing(false);
          setMessage(result.merged ? "Tags merged." : "Tag renamed.");
          router.refresh();
        })
        .catch((error: unknown) => setMessage(errorMessage(error, "Tag could not be renamed.")));
    });
  }

  function onDelete() {
    if (!deleteTag) return;
    const confirmed = window.confirm(
      `Delete ${tag.label} from ${tag.count.toLocaleString()} ${
        tag.count === 1 ? "keyword" : "keywords"
      }?`,
    );
    if (!confirmed) {
      return;
    }

    setMessage(null);
    startTransition(() => {
      void deleteTag({ name: tag.label, projectId })
        .then(unwrapActionResult)
        .then(() => {
          setMessage("Tag deleted.");
          router.refresh();
        })
        .catch((error: unknown) => setMessage(errorMessage(error, "Tag could not be deleted.")));
    });
  }

  if (isEditing) {
    return (
      <form className="flex min-w-[230px] flex-col gap-1.5" onSubmit={handleSubmit(onRename)}>
        <input type="hidden" {...register("projectId")} />
        <input type="hidden" {...register("fromName")} />
        <span className="flex items-center gap-1.5">
          <input
            aria-label={`New name for ${tag.label}`}
            className={inputClass}
            {...register("toName")}
          />
          <button
            aria-label={`Save ${tag.label} tag name`}
            className={iconButtonClass}
            disabled={isPending}
            type="submit"
          >
            <Check aria-hidden size={14} weight="bold" />
          </button>
          <button
            aria-label={`Cancel renaming ${tag.label}`}
            className={iconButtonClass}
            disabled={isPending}
            onClick={closeEdit}
            type="button"
          >
            <X aria-hidden size={14} weight="bold" />
          </button>
        </span>
        <span className="font-mono text-[10.5px] text-red-text">
          {errors.toName?.message ?? message}
        </span>
      </form>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {renameTag ? (
        <Tooltip title="Rename">
          <span className="inline-grid">
            <button
              aria-label={`Rename ${tag.label}`}
              className={iconButtonClass}
              disabled={isPending}
              onClick={() => {
                setMessage(null);
                setIsEditing(true);
              }}
              type="button"
            >
              <PencilSimple aria-hidden size={14} />
            </button>
          </span>
        </Tooltip>
      ) : null}
      {deleteTag ? (
        <Tooltip title="Delete">
          <span className="inline-grid">
            <button
              aria-label={`Delete ${tag.label}`}
              className={iconButtonClass}
              disabled={isPending}
              onClick={onDelete}
              type="button"
            >
              <Trash aria-hidden size={14} />
            </button>
          </span>
        </Tooltip>
      ) : null}
      {message ? <span className="font-mono text-[10.5px] text-fg-muted">{message}</span> : null}
    </span>
  );
}
