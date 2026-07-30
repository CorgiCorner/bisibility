"use client";

import { actionErrorMessage } from "@/components/keywords/action-utils";
import { Modal, useToast } from "@/components/ui";
import type { CompetitorSavedViewConfig } from "@/lib/competitors/saved-view-model";
import { competitorSavedViewHref } from "@/lib/competitors/saved-view-model";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { type SavedViewFormValues, savedViewNameSchema } from "@/lib/keywords/saved-view-model";
import type { ProjectRef } from "@/lib/routing/app-path";
import type { CreateProjectSavedViewInput, SavedViewResource } from "@/lib/saved-views/model";
import { BookmarkSimpleIcon as BookmarkSimple } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";

type SaveCompetitorViewModalProps = {
  config: CompetitorSavedViewConfig;
  createSavedViewAction?: (input: CreateProjectSavedViewInput) => Promise<SavedViewResource>;
  onClose: () => void;
  onSaved: () => void;
  open: boolean;
  projectId: string;
  projectRef: ProjectRef;
};

export function SaveCompetitorViewModal({
  config,
  createSavedViewAction,
  onClose,
  onSaved,
  open,
  projectId,
  projectRef,
}: Readonly<SaveCompetitorViewModalProps>) {
  const router = useRouter();
  const { showToast } = useToast();
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setError,
  } = useForm<SavedViewFormValues>({
    defaultValues: { name: "" },
    resolver: zodResolver(savedViewNameSchema),
  });

  async function submit(values: SavedViewFormValues) {
    if (!createSavedViewAction) return;
    try {
      const view = await createSavedViewAction({ config, name: values.name, projectId });
      if (view.surface !== "competitors") throw new Error("Unexpected saved view surface.");
      onSaved();
      onClose();
      showToast("Comparison view saved");
      router.push(competitorSavedViewHref(projectRef, view.id, view.config));
      router.refresh();
    } catch (error) {
      setError("root", { message: actionErrorMessage(error) });
    }
  }

  return (
    <Modal
      footer={
        <>
          <button
            className="text-[13px] font-semibold text-fg-muted"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-[9px] bg-accent px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-60"
            disabled={isSubmitting || !createSavedViewAction}
            form="save-competitor-view"
            type="submit"
          >
            <BookmarkSimple aria-hidden size={15} weight="bold" />
            {isSubmitting ? "Saving..." : "Save view"}
          </button>
        </>
      }
      onClose={onClose}
      open={open}
      size="sm"
      title="Save comparison view"
    >
      <form
        className="grid gap-3"
        id="save-competitor-view"
        onSubmit={handleSubmit((values) => void submit(values))}
      >
        <label className="grid gap-2 font-mono text-[10px] uppercase text-fg-faint">
          View name
          <input
            className="rounded-[9px] border border-border-strong bg-bg-sunken px-3 py-2.5 font-sans text-[13.5px] normal-case text-fg outline-none focus:border-accent"
            placeholder="e.g. US mobile core set"
            {...register("name")}
          />
        </label>
        {errors.name ? <p className="m-0 text-[12px] text-red">{errors.name.message}</p> : null}
        {errors.root ? <p className="m-0 text-[12px] text-red">{errors.root.message}</p> : null}
        <p className="m-0 text-[12.5px] leading-5 text-fg-muted">
          Saves this location, device, Google engine, filters, and excluded keywords.
        </p>
      </form>
    </Modal>
  );
}
