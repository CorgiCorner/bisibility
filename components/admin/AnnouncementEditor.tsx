"use client";

import { InstanceAnnouncementBanner } from "@/components/shell/InstanceAnnouncementBanner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { zodResolver } from "@/lib/forms/zod-resolver";
import {
  type AnnouncementContent,
  announcementContentSchema,
  isAnnouncementHref,
} from "@/lib/instance-announcements/schema";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { useForm, useWatch } from "react-hook-form";

export function AnnouncementEditor({
  initial,
  busy,
  error,
  onClose,
  onSave,
}: Readonly<{
  initial: AnnouncementContent | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (content: AnnouncementContent) => void;
}>) {
  const t = useTranslations("instanceAdmin.announcements");
  const id = useId();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<AnnouncementContent>({
    defaultValues: {
      title: initial?.title ?? "",
      message: initial?.message ?? "",
      href: initial?.href ?? "",
      linkLabel: initial?.linkLabel ?? "",
    },
    resolver: zodResolver(
      announcementContentSchema({ required: t("validationText"), link: t("validationLink") }),
    ),
  });
  const preview = useWatch({ control }) as AnnouncementContent;
  const fields = ["title", "message", "href", "linkLabel"] as const;
  return (
    <Modal
      open
      onClose={onClose}
      dismissDisabled={busy}
      size="lg"
      title={initial ? t("edit") : t("create")}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button type="submit" form={id} loading={busy}>
            {t("save")}
          </Button>
        </div>
      }
    >
      <form id={id} className="flex flex-col gap-4" onSubmit={handleSubmit(onSave)}>
        {fields.map((field) => {
          const fieldId = `${id}-${field}`;
          const errorId = `${fieldId}-error`;
          const props = {
            ...register(field),
            id: fieldId,
            disabled: busy,
            "aria-invalid": errors[field] ? true : undefined,
            "aria-describedby": errors[field] ? errorId : undefined,
          };
          return (
            <div key={field} className="flex flex-col gap-1.5">
              <label htmlFor={fieldId} className="text-sm font-medium text-fg">
                {t(field)}
              </label>
              {field === "message" ? (
                <Textarea {...props} invalid={Boolean(errors[field])} maxLength={2000} />
              ) : (
                <Input
                  {...props}
                  className={errors[field] ? "border-red focus:border-red" : undefined}
                  maxLength={field === "title" ? 120 : field === "href" ? 2048 : 80}
                />
              )}
              {errors[field] ? (
                <p id={errorId} className="text-xs text-red-text">
                  {errors[field]?.message}
                </p>
              ) : null}
            </div>
          );
        })}
        <p className="text-xs text-fg-muted">{t("linkHelp")}</p>
        <div>
          <p className="mb-2 text-xs font-medium text-fg-muted">{t("preview")}</p>
          <div className="overflow-hidden rounded-control border border-border">
            <InstanceAnnouncementBanner
              live={false}
              announcement={{
                ...preview,
                href: isAnnouncementHref(preview.href) ? preview.href : "",
              }}
              defaultLinkLabel={t("learnMore")}
            />
          </div>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-red-text">
            {error}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
