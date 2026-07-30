"use client";

import { actionErrorMessage } from "@/components/keywords/action-utils";
import { Modal, useToast } from "@/components/ui";
import { zodResolver } from "@/lib/forms/zod-resolver";
import {
  type CreateSavedViewInput,
  type KeywordSavedView,
  type SavedViewConfig,
  type SavedViewFormValues,
  savedViewHref,
  savedViewNameSchema,
} from "@/lib/keywords/saved-view-model";
import {
  BookmarkSimpleIcon as BookmarkSimple,
  FunnelSimpleIcon as FunnelSimple,
  XIcon as X,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";

type SaveViewModalProps = {
  activeFiltersSummary: string;
  config: SavedViewConfig;
  createSavedViewAction?: (input: CreateSavedViewInput) => Promise<KeywordSavedView>;
  onClose: () => void;
  open: boolean;
  projectId: string;
};

export function SaveViewModal({
  activeFiltersSummary,
  config,
  createSavedViewAction,
  onClose,
  open,
  projectId,
}: Readonly<SaveViewModalProps>) {
  const router = useRouter();
  const { showToast } = useToast();
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setError,
    watch,
  } = useForm<SavedViewFormValues>({
    defaultValues: { name: "" },
    resolver: zodResolver(savedViewNameSchema),
  });
  const previewName = watch("name").trim() || "New view";

  async function submit(values: SavedViewFormValues) {
    if (!createSavedViewAction) {
      return;
    }

    try {
      const view = await createSavedViewAction({ config, name: values.name, projectId });
      showToast("View saved");
      onClose();
      router.push(savedViewHref(projectId, view.id, view.config.lens));
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
            className="p-0 text-[13px] font-semibold text-fg-muted outline-none hover:text-fg focus-visible:text-fg"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="inline-flex items-center gap-[7px] rounded-[9px] bg-accent px-4 py-2.5 text-[13px] font-semibold text-white outline-none hover:opacity-90 focus-visible:opacity-90 disabled:opacity-60"
            disabled={isSubmitting || !createSavedViewAction}
            form="save-keyword-view"
            type="submit"
          >
            <BookmarkSimple size={15} weight="bold" />
            {isSubmitting ? "Saving..." : "Save view"}
          </button>
        </>
      }
      onClose={onClose}
      open={open}
      size="sm"
      title={
        <span className="block">
          <span className="block">Save view</span>
          <span className="mt-1 block text-[12.5px] font-normal tracking-normal text-fg-muted">
            Save the current keyword scope and filters as a named view.
          </span>
        </span>
      }
    >
      <form
        className="grid gap-[18px]"
        id="save-keyword-view"
        onSubmit={handleSubmit((values) => void submit(values))}
      >
        <div className="flex items-center gap-2 rounded-[11px] border border-dashed border-border-strong bg-bg-sunken px-[14px] py-3">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.5px] text-fg-faint">
            Preview
          </span>
          <span className="inline-flex min-w-0 items-center gap-1.5 truncate rounded-lg border border-border-strong bg-accent-soft px-3 py-1.5 text-[12px] font-semibold text-accent">
            <BookmarkSimple className="shrink-0" size={13} weight="fill" />
            <span className="truncate">{previewName}</span>
          </span>
        </div>

        <label className="grid gap-[7px] font-mono text-[10px] uppercase tracking-[0.5px] text-fg-faint">
          {"View name "}
          <input
            className="rounded-[9px] border border-border-strong bg-bg-sunken px-3 py-2.5 font-sans text-[13.5px] font-medium normal-case tracking-normal text-fg outline-none focus:border-accent"
            placeholder="e.g. Product pages down"
            {...register("name")}
          />
          {errors.name ? <span className="text-[11px] text-red">{errors.name.message}</span> : null}
        </label>

        <div className="flex items-start gap-2 rounded-[10px] border border-border bg-bg px-[13px] py-[11px]">
          <span className="flex h-[17px] shrink-0 items-center">
            <FunnelSimple className="text-accent" size={14} />
          </span>
          <span className="text-[11.5px] leading-[1.45] text-fg-muted">
            <strong className="font-semibold text-fg">Captured view:</strong> {activeFiltersSummary}
          </span>
        </div>

        {errors.root ? (
          <p className="m-0 flex items-center gap-1.5 font-mono text-[11.5px] text-red">
            <X size={12} weight="bold" />
            {errors.root.message}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
