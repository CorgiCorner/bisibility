"use client";

import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/toast-context";
import { zodResolver } from "@/lib/forms/zod-resolver";
import {
  type CreateSavedViewInput,
  type KeywordSavedView,
  type SavedViewConfig,
  type SavedViewFormValues,
  savedViewHref,
  savedViewNameSchema,
} from "@/lib/keywords/saved-view-model";
import { BookmarkSimpleIcon as BookmarkSimple } from "@phosphor-icons/react/dist/csr/BookmarkSimple";
import { FunnelSimpleIcon as FunnelSimple } from "@phosphor-icons/react/dist/csr/FunnelSimple";
import { XIcon as X } from "@phosphor-icons/react/dist/csr/X";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { presentBulkActionError } from "./bulk-action-error";

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
  const t = useTranslations("projectRankTracker.keywordImport.management.saveView");
  const sharedErrors = useSharedErrorMessages();
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
  const previewName = watch("name").trim() || t("fallbackName");

  async function submit(values: SavedViewFormValues) {
    if (!createSavedViewAction) {
      return;
    }

    try {
      const view = await createSavedViewAction({ config, name: values.name, projectId });
      showToast(t("saved"), { severity: "success" });
      onClose();
      router.push(savedViewHref(projectId, view.id, view.config.lens));
      router.refresh();
    } catch (error) {
      setError("root", { message: presentBulkActionError(error, sharedErrors, t("saveFailed")) });
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
            {t("cancel")}
          </button>
          <Button
            disabled={!createSavedViewAction}
            form="save-keyword-view"
            loading={isSubmitting}
            loadingLabel={t("saving")}
            startIcon={<BookmarkSimple size={15} weight="regular" />}
            type="submit"
            variant="primary"
          >
            {t("save")}
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      size="sm"
      title={
        <span className="block">
          <span className="block">{t("save")}</span>
          <span className="mt-1 block text-[12.5px] font-normal tracking-normal text-fg-muted">
            {t("description")}
          </span>
        </span>
      }
    >
      <form
        className="grid gap-4.5"
        id="save-keyword-view"
        onSubmit={handleSubmit((values) => void submit(values))}
      >
        <div className="flex items-center gap-2 rounded-control border border-dashed border-border bg-transparent px-3.5 py-3">
          <span className="font-sans tabular-nums text-[9.5px] uppercase tracking-[0.5px] text-fg-muted">
            {t("preview")}
          </span>
          <span className="inline-flex min-w-0 items-center gap-1.5 truncate rounded-control border border-border bg-accent-soft px-3 py-1.5 text-[12px] font-semibold text-accent-text">
            <BookmarkSimple className="shrink-0" size={13} weight="regular" />
            <span className="truncate">{previewName}</span>
          </span>
        </div>

        <label className="grid gap-[7px] font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted">
          {t("name")}
          <input
            className="rounded-control border border-border-control bg-transparent px-3 py-2.5 font-sans tabular-nums text-[13.5px] font-medium normal-case tracking-normal text-fg outline-none placeholder:text-[12px] placeholder:leading-4 focus:border-accent"
            placeholder={t("namePlaceholder")}
            {...register("name")}
          />
          {errors.name ? (
            <span className="text-[11px] text-red-text">{errors.name.message}</span>
          ) : null}
        </label>

        <div className="flex items-start gap-2 rounded-control border border-border bg-bg px-[13px] py-[11px]">
          <span className="flex h-[17px] shrink-0 items-center">
            <FunnelSimple weight="regular" className="text-accent-text" size={14} />
          </span>
          <span className="text-[11.5px] leading-[1.45] text-fg-muted">
            <strong className="font-semibold text-fg">{t("captured")}</strong>{" "}
            {activeFiltersSummary}
          </span>
        </div>

        {errors.root ? (
          <p className="m-0 flex items-center gap-1.5 font-sans tabular-nums text-[11.5px] text-red-text">
            <X size={12} weight="regular" />
            {errors.root.message}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
