"use client";

import { AppDrawer, MenuSelect, Textarea } from "@/components/ui";
import { addSignalNote } from "@/lib/actions/signals";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { type CreateSignalNoteInput, createSignalNoteSchema } from "@/lib/timeline/types";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { NotePencilIcon as NotePencil, PlusIcon as Plus, XIcon as X } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

type AddNoteFormProps = {
  canCreate: boolean;
  projectId: string;
};

const FORM_ID = "timeline-add-note-form";

const severityOptions = [
  { label: "Info", value: "info" },
  { label: "Warning", value: "warning" },
  { label: "Critical", value: "critical" },
];

const labelClass = "font-mono text-[10.5px] font-semibold uppercase tracking-[0.5px] text-fg-muted";
const severityTriggerClass =
  "min-h-9 w-full justify-between rounded-lg border-border-strong bg-transparent px-3 font-sans text-[12px] font-semibold normal-case tracking-normal";

const defaultValues = (projectId: string): CreateSignalNoteInput => ({
  note: "",
  projectId,
  severity: "info",
  url: "",
});

export function AddNoteForm({ canCreate, projectId }: Readonly<AddNoteFormProps>) {
  if (!canCreate) return null;
  return <AddNoteFormControls projectId={projectId} />;
}

function AddNoteFormControls({ projectId }: Readonly<{ projectId: string }>) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
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
    resolver: zodResolver(createSignalNoteSchema),
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
        .catch((error: unknown) =>
          setMessage(actionErrorMessage(error, "Note could not be added.")),
        );
    });
  }

  return (
    <>
      <button
        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent-solid px-3 text-[12px] font-semibold text-primary-contrast outline-none transition-opacity hover:opacity-90 focus-visible:opacity-90"
        onClick={() => setOpen(true)}
        type="button"
      >
        <Plus aria-hidden size={14} weight="bold" />
        Add note
      </button>
      <AppDrawer
        description="Attach context to the project timeline - a deploy, a page change, an experiment."
        footer={
          <div className="flex items-center justify-end gap-1.5">
            <button
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-border-strong bg-bg-elev px-3 text-[12px] font-semibold text-fg-muted hover:border-accent hover:text-accent-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid"
              onClick={close}
              type="button"
            >
              <X aria-hidden size={13} />
              Cancel
            </button>
            <button
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-accent bg-accent-solid px-3 text-[12px] font-semibold text-primary-contrast hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid disabled:cursor-not-allowed disabled:bg-bg-sunken disabled:text-fg-muted"
              disabled={isPending}
              form={FORM_ID}
              type="submit"
            >
              <NotePencil aria-hidden size={13} />
              {isPending ? "Saving..." : "Save note"}
            </button>
          </div>
        }
        onClose={close}
        open={open}
        title="Add note"
      >
        <form className="grid gap-4" id={FORM_ID} onSubmit={handleSubmit(onSubmit)}>
          <input type="hidden" {...register("projectId")} />
          <label className="grid gap-1.5" htmlFor="timeline-note">
            <span className={labelClass}>Note</span>
            <Textarea
              className="min-h-[110px]"
              id="timeline-note"
              invalid={Boolean(errors.note)}
              placeholder="Add context for a ranking, URL, deploy, or page event."
              resize="vertical"
              {...register("note")}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
            <label className="grid gap-1.5">
              <span className={labelClass}>URL</span>
              <input
                className="h-9 min-w-0 rounded-lg border border-border-strong bg-transparent px-3 font-mono text-[12px] text-fg outline-none focus:border-accent"
                placeholder="https://example.com/page"
                type="url"
                {...register("url")}
              />
            </label>
            <label className="grid gap-1.5">
              <span className={labelClass}>Severity</span>
              <input type="hidden" {...register("severity")} />
              <MenuSelect
                ariaLabel="Severity"
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
          <div className="min-h-4 font-mono text-[10.5px] text-red-text">
            {errors.note?.message ?? errors.url?.message ?? message}
          </div>
        </form>
      </AppDrawer>
    </>
  );
}
