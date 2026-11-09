"use client";

import { Button } from "@/components/ui/Button";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { inputControlSizeClassName } from "@/components/ui/input-styles";
import { useZodForm } from "@/lib/forms/use-zod-form";
import { ClockCounterClockwiseIcon as ClockCounterClockwise } from "@phosphor-icons/react/dist/csr/ClockCounterClockwise";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { z } from "zod";

const emailSchema = z.string().email();

function createLookupSchema(validationMessage: string) {
  return z.object({
    identifier: z
      .string()
      .trim()
      .min(1, validationMessage)
      .max(320, validationMessage)
      .refine(
        (value) => emailSchema.safeParse(value).success || /^[^\s@]+$/.test(value),
        validationMessage,
      ),
  });
}

type LookupForm = { identifier: string };
export function AdminAccountLookupForm({
  busy,
  onSubmit,
}: Readonly<{ busy: boolean; onSubmit: (values: LookupForm) => void }>) {
  const t = useTranslations("instanceAdmin.account");
  const controls = useTranslations("instanceAdmin.controls");
  const id = useId();
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useZodForm<LookupForm>(createLookupSchema(t("validationIdentifier")), {
    defaultValues: { identifier: "" },
  });
  return (
    <>
      <form className="mt-3" onSubmit={handleSubmit(onSubmit)}>
        <FieldLabel className="text-sm font-medium text-fg" htmlFor={id} label={t("identifier")} />
        <div className="mt-1.5 flex flex-wrap items-start gap-2.5">
          <span
            className={`${inputControlSizeClassName} flex min-w-[240px] max-w-[420px] flex-1 items-center gap-2 rounded-control border border-border-control bg-transparent focus-within:border-accent`}
          >
            <MagnifyingGlass
              aria-hidden
              className="shrink-0 text-fg-muted"
              size={14}
              weight="regular"
            />
            <input
              aria-invalid={errors.identifier ? "true" : undefined}
              aria-describedby={errors.identifier ? `${id}-error` : undefined}
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[12.5px] leading-5 text-fg outline-none"
              id={id}
              placeholder={t("placeholder")}
              spellCheck={false}
              {...register("identifier")}
            />
          </span>
          <Button
            size="input"
            disabled={busy}
            loading={busy}
            loadingLabel={controls("lookingUp")}
            type="submit"
          >
            {controls("lookUp")}
          </Button>
        </div>
        {errors.identifier ? (
          <p id={`${id}-error`} className="mt-1.5 text-[11px] text-red-text" role="alert">
            {errors.identifier.message}
          </p>
        ) : null}
      </form>
      <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-fg-muted">
        <ClockCounterClockwise aria-hidden size={12} weight="regular" />
        {t("auditNotice")}
      </p>
    </>
  );
}
