"use client";

import { AppDrawer } from "@/components/ui/AppDrawer";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { Textarea } from "@/components/ui/Textarea";
import { addSignalNote } from "@/lib/actions/signals";
import { zodResolver } from "@/lib/forms/zod-resolver";
import type { CreateSignalNoteInput } from "@/lib/timeline/types";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { NotePencilIcon as NotePencil } from "@phosphor-icons/react/dist/csr/NotePencil";
import { PlusIcon as Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { XIcon as X } from "@phosphor-icons/react/dist/csr/X";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { createTimelineNoteFormSchema } from "./timeline-note-form-schema";

type AddNoteFormProps = {
  canCreate: boolean;
  compact?: boolean;
  projectId: string;
};

const FORM_ID = "timeline-add-note-form";

const labelClass =
  "font-sans tabular-nums text-[10.5px] font-semibold uppercase tracking-[0.5px] text-fg-muted";
const severityTriggerClass = "normal-case tracking-normal";

const defaultValues = (projectId: string): CreateSignalNoteInput => ({
  note: "",
  projectId,
  severity: "info",
  url: "",
});

export function AddNoteForm({ canCreate, compact = false, projectId }: Readonly<AddNoteFormProps>) {
  if (!canCreate) return null;
  return <AddNoteFormControls compact={compact} projectId={projectId} />;
}

function AddNoteFormControls({
  compact,
  projectId,
}: Readonly<{ compact: boolean; projectId: string }>) {
  const t = useTranslations("projectTimeline.form");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const schema = useMemo(() => createTimelineNoteFormSchema(t), [t]);
  const severityOptions = [
    { label: t("severityInfo"), value: "info" },
    { label: t("severityWarning"), value: "warning" },
    { label: t("severityCritical"), value: "critical" },
  ];
  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
    setValue,
    watch,
  } = useForm<CreateSignalNoteInput>({
    defaultValues: defaultValues(projectId),
    mode: "onChange",
    resolver: zodResolver(schema),
  });
  const severity = watch("severity");

  function close() {
    setMessage(null);
    setOpen(false);
    reset(defaultValues(projectId));
  }

  function onSubmit(values: CreateSignalNoteInput) {
    setMessage(null);
    startTransition(() => {
      void addSignalNote(values)
        .then(() => {
          reset(defaultValues(projectId));
          setOpen(false);
          router.refresh();
        })
        .catch((error: unknown) => setMessage(actionErrorMessage(error, t("saveError"))));
    });
  }

  return (
    <>
      <Button size={compact ? "sm" : "md"} onClick={() => setOpen(true)} type="button">
        <Plus aria-hidden size={14} weight="regular" />
        {t("addNote")}
      </Button>
      <AppDrawer
        description={t("description")}
        footer={
          <div className="flex items-center justify-end gap-1.5">
            <Button variant="secondary" size="sm" onClick={close} type="button">
              <X weight="regular" aria-hidden size={13} />
              {t("cancel")}
            </Button>
            <Button size="sm" disabled={isPending} form={FORM_ID} type="submit">
              <NotePencil weight="regular" aria-hidden size={13} />
              {isPending ? t("saving") : t("save")}
            </Button>
          </div>
        }
        onClose={close}
        open={open}
        title={t("title")}
      >
        <form className="grid gap-4" id={FORM_ID} onSubmit={handleSubmit(onSubmit)}>
          <input type="hidden" {...register("projectId")} />
          <label className="grid gap-1.5" htmlFor="timeline-note">
            <span className={labelClass}>{t("note")}</span>
            <Textarea
              className="min-h-[110px]"
              id="timeline-note"
              invalid={Boolean(errors.note)}
              placeholder={t("notePlaceholder")}
              resize="vertical"
              {...register("note")}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
            <label className="grid gap-1.5" htmlFor="timeline-note-url">
              <span className={labelClass}>{t("url")}</span>
              <Input
                id="timeline-note-url"
                className="min-w-0"
                placeholder={t("urlPlaceholder")}
                type="url"
                {...register("url")}
              />
            </label>
            <label className="grid gap-1.5">
              <span className={labelClass}>{t("severity")}</span>
              <input type="hidden" {...register("severity")} />
              <MenuSelect
                size="input"
                ariaLabel={t("severity")}
                onChange={(value) =>
                  setValue("severity", value as CreateSignalNoteInput["severity"], {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
                options={severityOptions}
                triggerClassName={severityTriggerClass}
                value={severity ?? "info"}
              />
            </label>
          </div>
          <div className="min-h-4 font-sans tabular-nums text-[10.5px] text-red-text">
            {errors.note?.message ?? errors.url?.message ?? message}
          </div>
        </form>
      </AppDrawer>
    </>
  );
}
