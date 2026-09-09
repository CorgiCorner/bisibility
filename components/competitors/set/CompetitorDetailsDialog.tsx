"use client";

import { Button } from "@/components/ui/Button";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import {
  type CompetitorDetails,
  competitorDetailsFormSchema,
} from "@/lib/actions/competitor-set-input";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

export function CompetitorDetailsDialog({
  competitor,
  onClose,
  onSave,
}: Readonly<{
  competitor?: CompetitorDetails;
  onClose: () => void;
  onSave: (input: CompetitorDetails) => Promise<unknown>;
}>) {
  const router = useRouter();
  const formId = useId();
  const pending = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<z.input<typeof competitorDetailsFormSchema>, unknown, CompetitorDetails>({
    defaultValues: {
      aliases: competitor?.aliases.join(", ") ?? "",
      domain: competitor?.domain ?? "",
    },
    resolver: zodResolver(competitorDetailsFormSchema),
  });

  async function submit(values: CompetitorDetails) {
    if (pending.current) return;
    pending.current = true;
    setMessage(null);
    try {
      await onSave(values);
      onClose();
      router.refresh();
    } catch (error) {
      setMessage(actionErrorMessage(error, "Competitor could not be saved."));
    } finally {
      pending.current = false;
    }
  }

  function close() {
    if (!pending.current && !isSubmitting) onClose();
  }

  return (
    <Modal
      open
      onClose={close}
      title={competitor ? "Edit competitor" : "Add competitor"}
      footer={
        <>
          <Button disabled={isSubmitting} onClick={close} size="sm" variant="secondary">
            Cancel
          </Button>
          <Button form={formId} loading={isSubmitting} size="sm" type="submit">
            {competitor ? "Save changes" : "Add competitor"}
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" id={formId} onSubmit={handleSubmit(submit)}>
        <div className="grid gap-1.5 text-[12px] font-medium text-fg">
          <FieldLabel htmlFor={`${formId}-domain`} label="Domain" />
          <Input
            aria-label="Competitor domain"
            aria-invalid={Boolean(errors.domain)}
            disabled={isSubmitting}
            id={`${formId}-domain`}
            placeholder="competitor.example.com"
            {...register("domain")}
          />
          {errors.domain?.message ? (
            <span className="text-red-text" role="alert">
              {errors.domain.message}
            </span>
          ) : null}
        </div>
        <div className="grid gap-1.5 text-[12px] font-medium text-fg">
          <FieldLabel htmlFor={`${formId}-aliases`} label="Brand aliases (optional)" />
          <Input
            aria-label="Competitor brand aliases"
            aria-invalid={Boolean(errors.aliases)}
            disabled={isSubmitting}
            id={`${formId}-aliases`}
            placeholder="Brand, Brand Platform"
            {...register("aliases")}
          />
          <span className="text-[11px] font-normal text-fg-muted">
            Brand names and spelling variants, separated by commas. Saved for future AI mention
            matching.
          </span>
          {errors.aliases?.message ? (
            <span className="text-red-text" role="alert">
              {errors.aliases.message}
            </span>
          ) : null}
        </div>
        {message ? (
          <span className="text-[11px] text-red-text" role="alert">
            {message}
          </span>
        ) : null}
      </form>
    </Modal>
  );
}
